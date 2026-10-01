import crypto from 'crypto'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { AgentRunPayload, AgentRunResult, ParsedToolCall, ToolResult } from '../../shared/agent/types'
import { parseToolCalls } from '../../shared/agent/parsers/xmlToolCallParser'
import { createAgentToolContext } from '../agent/AgentToolContext'
import { createToolExecutor } from '../agent/ToolExecutor'
import { agentOrchestrator } from '../agent/AgentOrchestrator'
import {
  registerAgentRun,
  submitAskQuestion,
  submitSwitchMode,
  unregisterAgentRun,
} from '../agent/askQuestionBridge'
import { registerShellOutputListener } from '../agent/shellOutputBridge'
import { clearAgentSession } from '../agent/agentSessionStore'
import { clearSessionTodos } from '../agent/todoSessionStore'
import { getShellService, killSessionShellJobs } from '../agent/shellRegistry'
import { workspaceService } from '../services/WorkspaceService'

export type AgentExecuteToolPayload = {
  name: string
  arguments: Record<string, unknown>
  toolCallId?: string
  sessionId?: string
  mode?: import('../../shared/agent/types').AgentMode
}

export function registerAgentHandlers(): void {
  const { ipcMain } = require('electron') as { ipcMain: IpcMain }

  ipcMain.handle(
    'agent:executeTool',
    async (_e, payload: AgentExecuteToolPayload): Promise<ToolResult> => {
      const mode = payload.mode ?? 'agent'
      const sessionId = payload.sessionId ?? 'default'
      const shellService = getShellService(sessionId)
      const ctx = createAgentToolContext(sessionId, shellService)
      const executor = createToolExecutor(ctx, mode)
      return executor.execute({
        name: payload.name,
        arguments: payload.arguments ?? {},
        toolCallId: payload.toolCallId
      })
    }
  )

  ipcMain.handle(
    'agent:executeTools',
    async (_e, payload: { calls: AgentExecuteToolPayload[]; sessionId?: string; mode?: import('../../shared/agent/types').AgentMode }): Promise<ToolResult[]> => {
      const mode = payload.mode ?? 'agent'
      const sessionId = payload.sessionId ?? 'default'
      const shellService = getShellService(sessionId)
      const ctx = createAgentToolContext(sessionId, shellService)
      const executor = createToolExecutor(ctx, mode)
      return executor.executeMany(
        payload.calls.map((c) => ({
          name: c.name,
          arguments: c.arguments ?? {},
          toolCallId: c.toolCallId
        }))
      )
    }
  )

  ipcMain.handle(
    'agent:parseToolCalls',
    (_e, text: string): ParsedToolCall[] => parseToolCalls(text)
  )

  ipcMain.handle('agent:clearSession', (_e, sessionId: string) => {
    const id = sessionId ?? 'default'
    clearAgentSession(id)
    clearSessionTodos(id)
  })

  ipcMain.handle(
    'agent:askQuestionSubmit',
    (
      _e,
      payload: {
        runId: string
        requestId: string
        answers: import('../../shared/agent/types').AskQuestionAnswers
      }
    ) => submitAskQuestion(payload.runId, payload.requestId, payload.answers)
  )

  ipcMain.handle(
    'agent:switchModeSubmit',
    (
      _e,
      payload: {
        runId: string
        requestId: string
        approved: boolean
        targetModeId: import('../../shared/agent/types').AgentMode
      }
    ) =>
      submitSwitchMode(payload.runId, payload.requestId, payload.approved, payload.targetModeId)
  )

  ipcMain.handle('agent:runStart', async (event: IpcMainInvokeEvent, payload: AgentRunPayload) => {
    const runId = crypto.randomUUID()
    let aborted = false

    registerAgentRun(runId, event.sender)
    const detachShellOutput = registerShellOutputListener(payload.sessionId, event.sender)
    ipcMain.once(`agent:abort:${runId}`, () => {
      aborted = true
      killSessionShellJobs(payload.sessionId)
    })

    setImmediate(async () => {
      try {
        const enriched: AgentRunPayload = {
          ...payload,
          runId,
          userContext: {
            ...payload.userContext,
            workspacePath: payload.userContext.workspacePath ?? workspaceService.current?.path ?? null
          }
        }

        const result: AgentRunResult = await agentOrchestrator.run(enriched, {
          isAborted: () => aborted,
          onStepStart: (step, max) => {
            if (aborted || event.sender.isDestroyed()) return
            event.sender.send(`agent:stepStart:${runId}`, { step, maxSteps: max })
          },
          onToken: (token) => {
            if (aborted || event.sender.isDestroyed()) return
            event.sender.send(`agent:token:${runId}`, token)
          },
          onReasoningToken: (token) => {
            if (aborted || event.sender.isDestroyed()) return
            event.sender.send(`agent:reasoning:${runId}`, token)
          },
          onContextUsage: (usage) => {
            if (aborted || event.sender.isDestroyed()) return
            event.sender.send(`agent:usage:${runId}`, usage)
          },
          onStep: (step, max, thinking) => {
            if (aborted || event.sender.isDestroyed()) return
            event.sender.send(`agent:step:${runId}`, { step, maxSteps: max, thinking })
          },
          onTool: (toolEvent) => {
            if (aborted || event.sender.isDestroyed()) return
            event.sender.send(`agent:tool:${runId}`, toolEvent)
          },
        })

        if (!aborted && !event.sender.isDestroyed()) {
          event.sender.send(`agent:done:${runId}`, result)
        }
      } catch (err: unknown) {
        if (!event.sender.isDestroyed()) {
          event.sender.send(`agent:error:${runId}`, String(err))
        }
      } finally {
        detachShellOutput()
        unregisterAgentRun(runId)
      }
    })

    return runId
  })
}
