import type {
  AgentCompletionUsage,
  AgentMode,
  AgentRunPayload,
  AgentRunResult,
  AgentToolEvent,
  AgentUserContext,
  ParsedToolCall,
} from '../../shared/agent/types'
import {
  type AgentChatMessage,
  isNativeToolsEnabled,
  openAiToolsFromSchemas,
} from '../../shared/agent/agentChatMessages'
import {
  buildBootstrapUserMessage,
  buildTurnUserMessage,
} from '../../shared/agent/contextBuilder'
import {
  getAgentSessionMessages,
  hasAgentBootstrap,
  setAgentSessionMessages,
} from './agentSessionStore'
import { cleanModeRemindersFromHistory } from '../../shared/agent/modeReminders'
import { buildAgentSystemPrompt } from '../../shared/agent/promptBuilder'
import { parseToolCalls } from '../../shared/agent/parsers/xmlToolCallParser'
import { nativeToolCallsToParsed } from '../../shared/agent/nativeToolCalls'
import { inferToolStreamBody, tryParsePartialToolArgs } from '../../shared/agent/tailPreview'
import { extractPrimaryThinking, stripAgentStreamForDisplay } from '../../shared/agent/thinkingBlocks'
import { formatToolResultsForModel, toolResultsToNativeMessages } from '../../shared/agent/toolResults'
import { getToolSchemas } from '../../shared/agent/tools'
import {
  AGENT_HARD_LIMITS,
  AGENT_SETTINGS_DEFAULTS,
  type AgentPauseReason,
} from '../../shared/agent/agentSettings'
import { contextKToTokens, MODEL_CONTEXT_DEFAULT_K } from '../../shared/modelConfig'
import { llmService } from '../services/LlmService'
import { gitService } from '../services/GitService'
import { modelRegistryService } from '../services/ModelRegistryService'
import { settingsService } from '../services/SettingsService'
import { createAgentToolContext } from './AgentToolContext'
import { createToolExecutor } from './ToolExecutor'
import { getRuntimeEnvironment } from './runtimeEnv'
import { getShellService } from './shellRegistry'
import { AgentAbortedError } from '../../shared/agent/errors'
import { resolveAgentPromptTokens } from '../../shared/agent/contextSummarizer'
import {
  shouldSummarizeAgentHistory,
  trySummarizeAgentHistory,
} from './runContextSummarization'
import { agentRunLog } from './agentRunLog'

export type AgentRunPhase = 'llm' | 'tools' | 'summarize' | null

export type AgentRunCallbacks = {
  onTool?: (event: AgentToolEvent) => void
  onStepStart?: (step: number, maxSteps: number) => void
  onStep?: (step: number, maxSteps: number, thinking: string | null) => void
  onToken?: (token: string) => void
  onReasoningToken?: (token: string) => void
  onContextUsage?: (usage: AgentCompletionUsage) => void
  onContextSummarized?: () => void
  onAgentPhase?: (phase: AgentRunPhase, detail?: string) => void
  isAborted?: () => boolean
}

const lastToolDeltaSnapshot = new Map<string, string>()

function emitStreamingToolDeltas(
  totalStep: number,
  calls: Array<{ index: number; id?: string; name?: string; argumentsPartial: string }>,
  callbacks: AgentRunCallbacks
): void {
  for (const call of calls) {
    if (!call.name) continue
    const deltaKey = `${totalStep}-${call.index}`
    const snapshot = `${call.name}\0${call.argumentsPartial}`
    if (lastToolDeltaSnapshot.get(deltaKey) === snapshot) continue
    lastToolDeltaSnapshot.set(deltaKey, snapshot)
    const args = tryParsePartialToolArgs(call.argumentsPartial)
    const pathArg = typeof args.path === 'string' ? args.path : undefined
    const contentsArg =
      typeof args.contents === 'string'
        ? args.contents
        : typeof args.new_string === 'string'
          ? args.new_string
          : undefined

    callbacks.onTool?.({
      step: totalStep,
      toolId: `${totalStep}-${call.index}`,
      status: 'pending',
      name: call.name,
      arguments: args,
      result: '',
      filePath: pathArg,
      newContent: contentsArg,
      streamBody: inferToolStreamBody(call.name, args, call.argumentsPartial),
      startedAt: Date.now(),
    })
  }
}

function emitContextUsage(callbacks: AgentRunCallbacks): AgentCompletionUsage | undefined {
  const raw = llmService.getLastCompletionUsage()
  if (!raw) return undefined
  const usage: AgentCompletionUsage = {
    promptTokens: raw.promptTokens,
    completionTokens: raw.completionTokens,
    totalTokens: raw.totalTokens,
  }
  callbacks.onContextUsage?.(usage)
  return usage
}

function getModelContextTokens(): number {
  const activeId = settingsService.get('activeModelId')
  const model = activeId ? modelRegistryService.getById(activeId) : null
  return contextKToTokens(model?.contextSize ?? MODEL_CONTEXT_DEFAULT_K)
}

function contextUsagePercent(promptTokens: number): number {
  const total = getModelContextTokens()
  return total > 0 ? (promptTokens / total) * 100 : 0
}

async function enrichUserContext(ctx: AgentUserContext): Promise<AgentUserContext> {
  const enriched = { ...ctx }
  if (ctx.workspacePath) {
    try {
      const info = await gitService.getInfo(ctx.workspacePath)
      enriched.isGitRepo = info.isRepo
      enriched.gitBranch = info.isRepo ? info.branch : undefined
    } catch {
      enriched.isGitRepo = false
    }
  }
  return enriched
}

async function executeToolCalls(
  toolCalls: ParsedToolCall[],
  totalStep: number,
  executor: ReturnType<typeof createToolExecutor>,
  callbacks: AgentRunCallbacks
) {
  const FILE_TOOL_MIN_PENDING_MS = 320
  const toolEvents: AgentToolEvent[] = []
  const results = []

  for (let i = 0; i < toolCalls.length; i++) {
    if (callbacks.isAborted?.()) break
    const call = toolCalls[i]
    const toolId = `${totalStep}-${i}`
    const pathArg = typeof call.arguments.path === 'string' ? call.arguments.path : undefined
    const contentsArg =
      typeof call.arguments.contents === 'string'
        ? call.arguments.contents
        : typeof call.arguments.new_string === 'string'
          ? call.arguments.new_string
          : undefined
    const isFileTool = call.name === 'Write' || call.name === 'StrReplace' || call.name === 'Delete'

    callbacks.onTool?.({
      step: totalStep,
      toolId,
      status: 'pending',
      name: call.name,
      arguments: call.arguments,
      result: '',
      filePath: pathArg,
      newContent: contentsArg,
      streamBody: inferToolStreamBody(call.name, call.arguments),
      startedAt: Date.now(),
    })

    const pendingStarted = Date.now()
    const result = await executor.execute({
      name: call.name,
      arguments: call.arguments,
      toolCallId: call.toolCallId,
    })
    if (isFileTool) {
      const elapsed = Date.now() - pendingStarted
      if (elapsed < FILE_TOOL_MIN_PENDING_MS) {
        await new Promise((resolve) => setTimeout(resolve, FILE_TOOL_MIN_PENDING_MS - elapsed))
      }
    }
    results.push(result)

    const event: AgentToolEvent = {
      step: totalStep,
      toolId,
      status: 'done',
      name: call.name,
      arguments: call.arguments,
      result: result.content,
      isError: result.isError,
      filePath: result.filePath,
      oldContent: result.oldContent,
      newContent: result.newContent,
      directoryPath: result.directoryPath,
      streamBody:
        call.name === 'Shell' || call.name === 'AwaitShell'
          ? result.content
          : inferToolStreamBody(call.name, call.arguments, result.content),
      endedAt: Date.now(),
    }
    toolEvents.push(event)
    callbacks.onTool?.(event)
  }

  return { results, toolEvents }
}

function agentRunNeedsShell(payload: AgentRunPayload): boolean {
  if (!payload.allowedTools?.length) return true
  return payload.allowedTools.some((tool) => tool === 'Shell' || tool === 'AwaitShell')
}

export class AgentOrchestrator {
  async run(payload: AgentRunPayload, callbacks: AgentRunCallbacks = {}): Promise<AgentRunResult> {
    let currentMode: AgentMode = payload.mode ?? 'agent'
    const nativeTools = isNativeToolsEnabled()
    const batchSteps = settingsService.get('agentMaxSteps') ?? AGENT_SETTINGS_DEFAULTS.agentMaxSteps
    const batchWallMs =
      (settingsService.get('agentMaxWallTimeMin') ?? AGENT_SETTINGS_DEFAULTS.agentMaxWallTimeMin) *
      60_000
    const summarizeAtPercent =
      settingsService.get('agentSummarizeAtPercent') ?? AGENT_SETTINGS_DEFAULTS.agentSummarizeAtPercent
    const summarizeMode =
      settingsService.get('agentSummarizeMode') ?? AGENT_SETTINGS_DEFAULTS.agentSummarizeMode
    const priorSteps = payload.continueRun?.priorSteps ?? 0
    const hardMaxSteps = AGENT_HARD_LIMITS.maxSteps
    const displayMaxSteps = Math.min(hardMaxSteps, priorSteps + batchSteps)
    const startedAt = Date.now()
    agentRunLog(
      `run start session=${payload.sessionId} priorSteps=${priorSteps} batchSteps=${batchSteps} summarizeAt=${summarizeAtPercent}% mode=${summarizeMode}`
    )

    const shellService = agentRunNeedsShell(payload)
      ? getShellService(payload.sessionId, payload.userContext.workspacePath)
      : undefined
    const userContext = await enrichUserContext({
      ...payload.userContext,
      terminalsFolder:
        shellService?.getTerminalsDirectory() ?? payload.userContext.terminalsFolder,
    })

    const runtime = getRuntimeEnvironment()

    const sessionId = payload.sessionId
    const existing = getAgentSessionMessages(sessionId)
    let messages: AgentChatMessage[]

    const appendTurnUserMessage = (query: string) => {
      messages.push({
        role: 'user',
        content: buildTurnUserMessage(query, userContext),
      })
    }

    if (payload.continueRun) {
      if (!existing || !hasAgentBootstrap(existing)) {
        throw new Error('Cannot continue agent run: session not found')
      }
      messages = [...existing]
      messages[0] = { role: 'system', content: buildAgentSystemPrompt(currentMode) }
    } else if (existing && hasAgentBootstrap(existing)) {
      messages = cleanModeRemindersFromHistory([...existing])
      messages[0] = { role: 'system', content: buildAgentSystemPrompt(currentMode) }
      appendTurnUserMessage(payload.query)
    } else {
      messages = [
        { role: 'system', content: buildAgentSystemPrompt(currentMode) },
        { role: 'user', content: buildBootstrapUserMessage(userContext, runtime, currentMode) },
      ]
      for (const turn of payload.priorChatTurns ?? []) {
        const text = turn.content.trim()
        if (!text) continue
        messages.push({ role: turn.role, content: text })
      }
      appendTurnUserMessage(payload.query)
    }

    const toolEvents: AgentToolEvent[] = []
    const allowedTools = payload.allowedTools ? new Set(payload.allowedTools) : undefined
    let apiTools = nativeTools ? openAiToolsFromSchemas(getToolSchemas(currentMode)) : undefined
    let executor!: ReturnType<typeof createToolExecutor>

    const applyModeSwitch = (newMode: AgentMode) => {
      if (newMode === currentMode) return
      currentMode = newMode
      executor.setMode(newMode)
      if (messages[0]?.role === 'system') {
        messages[0] = { role: 'system', content: buildAgentSystemPrompt(currentMode) }
      }
      if (nativeTools) {
        apiTools = openAiToolsFromSchemas(getToolSchemas(currentMode))
      }
    }

    executor = createToolExecutor(
      createAgentToolContext(
        payload.sessionId,
        shellService,
        payload.runId,
        allowedTools,
        applyModeSwitch
      ),
      currentMode
    )

    let finalText = ''
    let batchStepCount = 0
    let lastUsage: AgentCompletionUsage | undefined
    let paused = false
    let pauseReason: AgentPauseReason | undefined
    lastToolDeltaSnapshot.clear()

    const maybeSummarizeContext = async (): Promise<boolean> => {
      const promptTokens = resolveAgentPromptTokens(messages, lastUsage?.promptTokens)
      if (!shouldSummarizeAgentHistory(messages, promptTokens)) {
        if (
          summarizeMode === 'pause'
          && contextUsagePercent(promptTokens) >= summarizeAtPercent
        ) {
          paused = true
          pauseReason = 'context'
          return true
        }
        return false
      }

      agentRunLog(
        `summarize start tokens=${promptTokens} pct=${contextUsagePercent(promptTokens).toFixed(1)}`
      )
      callbacks.onAgentPhase?.('summarize')
      let result: Awaited<ReturnType<typeof trySummarizeAgentHistory>> = {
        messages,
        summarized: false,
      }
      try {
        result = await trySummarizeAgentHistory(messages, promptTokens)
      } finally {
        callbacks.onAgentPhase?.(null)
        agentRunLog(`summarize end summarized=${result.summarized}`)
      }

      if (!result.summarized) {
        if (summarizeMode === 'pause' && contextUsagePercent(promptTokens) >= summarizeAtPercent) {
          paused = true
          pauseReason = 'context'
          return true
        }
        return false
      }

      messages = result.messages
      setAgentSessionMessages(sessionId, messages)
      callbacks.onContextSummarized?.()
      lastUsage = undefined

      const estimated = resolveAgentPromptTokens(messages)
      if (
        summarizeMode === 'pause'
        && contextUsagePercent(estimated) >= summarizeAtPercent
      ) {
        paused = true
        pauseReason = 'context'
        return true
      }
      return false
    }

    for (let step = 0; step < batchSteps; step++) {
      const totalStep = priorSteps + step + 1
      if (callbacks.isAborted?.()) break
      if (totalStep > hardMaxSteps) {
        finalText = 'Agent stopped: safety step limit reached.'
        pauseReason = 'hard_limit'
        break
      }
      if (Date.now() - startedAt > batchWallMs) {
        paused = true
        pauseReason = 'wall_time'
        break
      }

      callbacks.onStepStart?.(totalStep, displayMaxSteps)
      agentRunLog(`step ${totalStep} start priorSteps=${priorSteps} msgs=${messages.length}`)

      if (await maybeSummarizeContext()) break

      if (nativeTools) {
        let stepThinkingCommitted = false
        const commitStepThinking = (thinking: string | null) => {
          if (stepThinkingCommitted) return
          stepThinkingCommitted = true
          callbacks.onStep?.(totalStep, displayMaxSteps, thinking)
        }

        let result
        let llmHeartbeat: ReturnType<typeof setInterval> | undefined
        let llmWaitCleared = false
        const clearLlmWait = () => {
          if (llmWaitCleared) return
          llmWaitCleared = true
          callbacks.onAgentPhase?.(null)
        }
        try {
          agentRunLog(`step ${totalStep} llm stream start`)
          callbacks.onAgentPhase?.('llm', `step ${totalStep}`)
          llmHeartbeat = setInterval(() => {
            agentRunLog(`step ${totalStep} still waiting for LLM…`)
          }, 20_000)
          result = await llmService.completeAgentStream(messages, {
            images: step === 0 ? payload.images : undefined,
            tools: apiTools,
            onToken: (token) => {
              clearLlmWait()
              callbacks.onToken?.(token)
            },
            onReasoningToken: (token) => {
              clearLlmWait()
              callbacks.onReasoningToken?.(token)
            },
            onReasoningComplete: (reasoning) => commitStepThinking(reasoning.trim() || null),
            onToolCallDelta: (calls) => {
              clearLlmWait()
              emitStreamingToolDeltas(totalStep, calls, callbacks)
            },
            isAborted: callbacks.isAborted,
          })
          agentRunLog(`step ${totalStep} llm stream done tools=${result.toolCalls.length}`)
        } catch (err) {
          if (err instanceof AgentAbortedError) {
            finalText = err.message
            break
          }
          agentRunLog(`step ${totalStep} llm error: ${err instanceof Error ? err.message : String(err)}`)
          throw err
        } finally {
          if (llmHeartbeat) clearInterval(llmHeartbeat)
          callbacks.onAgentPhase?.(null)
        }

        if (callbacks.isAborted?.()) {
          finalText = 'Agent stopped.'
          break
        }

        lastUsage = emitContextUsage(callbacks) ?? lastUsage

        messages.push(result.assistantMessage)
        const toolCalls = nativeToolCallsToParsed(result.toolCalls)
        const thinking = result.reasoningContent.trim() || null

        if (toolCalls.length === 0) {
          commitStepThinking(thinking)
          finalText = result.content
          batchStepCount = step + 1
          break
        }

        commitStepThinking(thinking)
        const toolNames = toolCalls.map((c) => c.name).join(', ')
        agentRunLog(`step ${totalStep} tools start: ${toolNames}`)
        callbacks.onAgentPhase?.('tools', toolNames)
        const executed = await executeToolCalls(toolCalls, totalStep, executor, callbacks)
        callbacks.onAgentPhase?.(null)
        agentRunLog(`step ${totalStep} tools done`)
        toolEvents.push(...executed.toolEvents)
        if (callbacks.isAborted?.()) {
          finalText = 'Agent stopped.'
          messages.push(...toolResultsToNativeMessages(executed.results))
          break
        }
        messages.push(...toolResultsToNativeMessages(executed.results))
        batchStepCount = step + 1
        continue
      }

      let assistantRaw: string
      try {
        assistantRaw = await llmService.completeMessagesStream(messages, {
          images: step === 0 ? payload.images : undefined,
          onToken: (token) => callbacks.onToken?.(token),
          isAborted: callbacks.isAborted,
        })
      } catch (err) {
        if (err instanceof AgentAbortedError) {
          finalText = err.message
          break
        }
        throw err
      }

      if (callbacks.isAborted?.()) {
        finalText = 'Agent stopped.'
        break
      }

      lastUsage = emitContextUsage(callbacks) ?? lastUsage

      messages.push({ role: 'assistant', content: assistantRaw })

      const toolCalls = parseToolCalls(assistantRaw)
      if (toolCalls.length === 0) {
        const thinking = extractPrimaryThinking(assistantRaw)
        callbacks.onStep?.(totalStep, displayMaxSteps, thinking)
        finalText = stripAgentStreamForDisplay(assistantRaw)
        batchStepCount = step + 1
        break
      }

      const thinking = extractPrimaryThinking(assistantRaw)
      callbacks.onStep?.(totalStep, displayMaxSteps, thinking)

      const executed = await executeToolCalls(toolCalls, totalStep, executor, callbacks)
      toolEvents.push(...executed.toolEvents)
      if (callbacks.isAborted?.()) {
        finalText = 'Agent stopped.'
        messages.push({
          role: 'user',
          content: formatToolResultsForModel(executed.results),
        })
        break
      }
      messages.push({
        role: 'user',
        content: formatToolResultsForModel(executed.results),
      })

      batchStepCount = step + 1
    }

    const totalSteps = priorSteps + batchStepCount

    if (
      !finalText &&
      !paused &&
      pauseReason !== 'hard_limit' &&
      batchStepCount >= batchSteps &&
      batchStepCount > 0
    ) {
      paused = true
      pauseReason = 'batch_steps'
    }

    if (!finalText && callbacks.isAborted?.()) {
      finalText = 'Agent stopped.'
    } else if (!finalText && pauseReason === 'hard_limit') {
      // finalText already set
    } else if (!finalText && paused) {
      // batch pause — UI shows continue; no error prose
    }

    const canContinue =
      paused &&
      pauseReason !== 'hard_limit' &&
      totalSteps < hardMaxSteps &&
      !callbacks.isAborted?.()

    setAgentSessionMessages(sessionId, messages)

    agentRunLog(
      `run end steps=${totalSteps} paused=${paused} reason=${pauseReason ?? 'none'} finalText=${Boolean(finalText)}`
    )

    return {
      finalText,
      steps: totalSteps,
      toolEvents,
      usage: lastUsage,
      paused,
      pauseReason,
      canContinue,
      totalSteps,
    }
  }
}

export const agentOrchestrator = new AgentOrchestrator()
