import { create } from 'zustand'
import type { ChatMessage, ChatSession, ImageAttachment, ChatMessageAttachment } from '@shared/types'
import type {
  AgentCompletionUsage,
  AgentMode,
  AgentPlanPayload,
  AgentRunResult,
  AgentTodoItem,
  AgentToolEvent,
  AgentUserContext,
} from '@shared/agent/types'
import { buildAgentStepsFromLegacy, flattenToolEvents, upsertAgentStep } from '@shared/agent/agentSteps'
import { revertAgentChanges } from '@shared/agent/chatRollback'
import { looksLikeAgentStepBuffer } from '@shared/agent/thinkingBlocks'
import { useWorkspaceStore } from './workspaceStore'
import { useUiStore } from './uiStore'
import { t } from '@shared/i18n'
import {
  flushPendingToolEvents,
  flushReasoningTokens,
  queueReasoningToken,
  queueToolEvent,
} from './streamFlush'

interface AiState {
  sessions: ChatSession[]
  closedSessions: ChatSession[]
  activeSessionId: string | null
  isStreaming: boolean
  streamingSessionId: string | null
  streamingMessageId: string | null
  stopFn: (() => void) | null
  modelName: string | null
  isModelLoaded: boolean
  /** Last `prompt_tokens` from agent API (per active chat session). */
  agentPromptTokens: number | null
  activePlan: AgentPlanPayload | null
  agentTodos: AgentTodoItem[]

  getActiveMessages: () => ChatMessage[]
  createSession: () => string
  closeSession: (id: string) => void
  restoreSession: (id: string) => void
  setActiveSession: (id: string) => void
  forceAbortStream: () => void
  addUserMessage: (content: string, attachments?: ChatMessageAttachment[]) => void
  startAssistantMessage: () => string
  appendToken: (id: string, token: string) => void
  beginAgentStep: (messageId: string, step: number, maxSteps?: number) => void
  appendShellOutputToTool: (messageId: string, command: string, data: string) => void
  appendAgentStreamToken: (messageId: string, token: string) => void
  appendAgentReasoningToken: (messageId: string, token: string) => void
  setAgentContextUsage: (usage: AgentCompletionUsage) => void
  commitAgentStepThinking: (messageId: string, step: number, thinking: string | null) => void
  setActivePlan: (plan: AgentPlanPayload | null) => void
  clearActivePlan: () => void
  setAgentTodos: (todos: AgentTodoItem[]) => void
  clearAgentTodos: () => void
  appendToolEvent: (messageId: string, event: AgentToolEvent) => void
  finalizeMessage: (id: string) => void
  setStop: (fn: (() => void) | null) => void
  stop: () => void
  loadSessions: () => Promise<void>
  setModelStatus: (loaded: boolean, name: string | null) => void
  sendMessage: (
    prompt: string,
    workspacePath?: string,
    options?: { images?: ImageAttachment[]; displayText?: string; displayAttachments?: ChatMessageAttachment[] }
  ) => Promise<void>
  sendAgentMessage: (
    prompt: string,
    workspacePath: string | undefined,
    userContext: AgentUserContext,
    options?: {
      images?: ImageAttachment[]
      displayText?: string
      displayAttachments?: ChatMessageAttachment[]
      sessionId?: string
      mode?: AgentMode
    }
  ) => Promise<void>
  continueAgentRun: (
    assistantMessageId: string,
    workspacePath: string | undefined,
    userContext: AgentUserContext,
    options?: { sessionId?: string; mode?: AgentMode }
  ) => Promise<void>
  rollbackToUserMessage: (messageIndex: number, workspacePath?: string | null) => Promise<void>
  editUserMessageAndResend: (
    messageIndex: number,
    newText: string,
    workspacePath: string | undefined,
    userContext: AgentUserContext,
    options?: {
      images?: ImageAttachment[]
      displayAttachments?: ChatMessageAttachment[]
      sessionId?: string
      mode?: AgentMode
    }
  ) => Promise<void>
  editChatUserMessage: (
    messageIndex: number,
    newText: string,
    workspacePath?: string,
    options?: { images?: ImageAttachment[]; displayAttachments?: ChatMessageAttachment[] }
  ) => Promise<void>
}

function resolvePath(filePath: string, workspacePath?: string): string | null {
  const winAbsolute = /^[a-zA-Z]:/.test(filePath)
  const unixAbsolute = filePath.startsWith('/')

  if (winAbsolute) return filePath
  if (unixAbsolute) {
    const rel = filePath.replace(/^\//, '')
    return workspacePath ? `${workspacePath}/${rel}` : null
  }
  return workspacePath ? `${workspacePath}/${filePath}` : null
}

function extractFileBlocks(text: string): { filePath: string; code: string }[] {
  const blocks: { filePath: string; code: string }[] = []

  const explicit = /```[\w./-]*:([^\n]+)\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = explicit.exec(text)) !== null) {
    blocks.push({ filePath: m[1].trim(), code: m[2].trimEnd() })
  }
  if (blocks.length > 0) return blocks

  const segments = text.split(/(```[\s\S]*?```)/g)
  for (let i = 1; i < segments.length; i += 2) {
    const preceding = segments[i - 1]
    const codeBlock = segments[i]
    const fileMatch = preceding.match(/`([^`\n]+\.[a-zA-Z0-9]{1,10})`\s*$/)
    if (fileMatch) {
      const lines = codeBlock.split('\n')
      const code = lines.slice(1, -1).join('\n').trimEnd()
      blocks.push({ filePath: fileMatch[1].trim(), code })
    }
  }
  return blocks
}

const MAX_CLOSED_SESSIONS = 15

function titleFromPrompt(prompt: string): string {
  const text = prompt.trim().replace(/\s+/g, ' ')
  return text.length > 36 ? `${text.slice(0, 36)}…` : text
}

function countUserMessages(session: ChatSession): number {
  return session.messages.filter((m) => m.role === 'user').length
}

function trimClosedSessions(closed: ChatSession[]): ChatSession[] {
  return closed.filter((s) => countUserMessages(s) > 0).slice(0, MAX_CLOSED_SESSIONS)
}

let _msgId = 1
let _sessionId = 1
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(state: Pick<AiState, 'sessions' | 'activeSessionId' | 'closedSessions'>) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void window.api.saveChatSessions({
      sessions: state.sessions,
      activeSessionId: state.activeSessionId,
      closedSessions: state.closedSessions,
    })
  }, 400)
}

function syncLlmHistory(messages: ChatMessage[]) {
  void window.api.restoreChatHistory(messages.filter((m) => !m.isStreaming))
}

function patchSession(
  sessions: ChatSession[],
  sessionId: string,
  updater: (session: ChatSession) => ChatSession
): ChatSession[] {
  return sessions.map((s) => (s.id === sessionId ? updater(s) : s))
}

function applyAgentRunResult(message: ChatMessage, result: AgentRunResult): ChatMessage {
  const finalText =
    result.finalText?.trim() ||
    message.agentProseBuffer?.trim() ||
    message.content.trim()
  let agentSteps = message.agentSteps?.length
    ? message.agentSteps
    : buildAgentStepsFromLegacy(undefined, result.toolEvents)
  if (finalText && agentSteps.length) {
    const last = agentSteps[agentSteps.length - 1]!
    const lastProse = last.proseBlocks?.[last.proseBlocks.length - 1]?.trim()
    if (finalText !== lastProse) {
      agentSteps = upsertAgentStep(agentSteps, last.step, { proseBlock: finalText })
    }
  }
  return {
    ...message,
    content: finalText,
    agentProseBuffer: undefined,
    agentStreamBuffer: undefined,
    agentReasoningBuffer: undefined,
    streamingAgentStep: undefined,
    agentSteps,
    toolEvents: flattenToolEvents(agentSteps),
    agentCanContinue: Boolean(result.paused && result.canContinue),
    agentPauseReason: result.pauseReason,
    agentTotalSteps: result.totalSteps,
  }
}

type AgentSessionRunParams = {
  assistantId: string
  sessionId: string
  query: string
  workspacePath: string | undefined
  userContext: AgentUserContext
  mode?: AgentMode
  images?: ImageAttachment[]
  continueRun?: { priorSteps: number }
}

async function launchAgentSessionRun(
  get: () => AiState,
  set: (partial: Partial<AiState> | ((state: AiState) => Partial<AiState>)) => void,
  params: AgentSessionRunParams
): Promise<void> {
  const {
    assistantId,
    sessionId,
    query,
    workspacePath,
    userContext,
    mode,
    images,
    continueRun,
  } = params

  const {
    beginAgentStep,
    appendAgentStreamToken,
    appendAgentReasoningToken,
    setAgentContextUsage,
    commitAgentStepThinking,
    appendToolEvent,
    appendToken,
    finalizeMessage,
    setStop,
    appendShellOutputToTool,
  } = get()

  const unsubShell = window.api.onAgentShellOutput(sessionId, (payload) => {
    appendShellOutputToTool(assistantId, payload.command, payload.data)
  })

  const finishRun = () => {
    unsubShell()
    useUiStore.getState().clearPendingAskQuestion()
    useUiStore.getState().clearPendingSwitchMode()
  }

  const applyResult = (result: AgentRunResult) => {
    const sid = get().streamingSessionId ?? get().activeSessionId
    if (!sid) return
    set((s) => ({
      sessions: patchSession(s.sessions, sid, (session) => ({
        ...session,
        messages: session.messages.map((m) =>
          m.id === assistantId ? applyAgentRunResult(m, result) : m
        ),
      })),
    }))
  }

  const onBackgroundTask = (task: {
    agentId: string
    description: string
    subagentType: string
    response?: string
    error?: string
    steps?: number
    status: 'done' | 'error'
  }) => {
    useUiStore.getState().setStatusMessage(t.taskDoneStatus(task.description), 8000)
    const msg = get().sessions.flatMap((s) => s.messages).find((m) => m.id === assistantId)
    const step =
      msg?.streamingAgentStep ??
      msg?.agentSteps?.[msg.agentSteps.length - 1]?.step ??
      1
    appendToolEvent(assistantId, {
      step,
      toolId: `task-bg-${task.agentId}`,
      name: 'Task',
      status: 'done',
      arguments: { description: task.description, subagent_type: task.subagentType },
      result: JSON.stringify({ status: 'done', response: task.response, steps: task.steps }),
      streamBody: task.response ?? task.error ?? '',
      isError: task.status === 'error',
    })
  }

  const handleError = (err: string) => {
    finishRun()
    appendToken(assistantId, `\n\n${t.errorPrefix(err)}`)
    finalizeMessage(assistantId)
  }

  const handleDone = async (result: AgentRunResult) => {
    applyResult(result)

    if (result.paused && result.canContinue) {
      const settings = await window.api.getSettings()
      if (settings.agentAutoContinue !== false) {
        useUiStore.getState().setStatusMessage(t.agentAutoContinuing, 2000)
        const sid = get().streamingSessionId ?? get().activeSessionId
        if (sid) {
          set({
            isStreaming: true,
            streamingSessionId: sid,
            streamingMessageId: assistantId,
            sessions: patchSession(get().sessions, sid, (session) => ({
              ...session,
              messages: session.messages.map((m) =>
                m.id === assistantId
                  ? { ...m, isStreaming: true, agentCanContinue: false }
                  : m
              ),
            })),
          })
        }
        setStop(await startBatch({ priorSteps: result.totalSteps ?? 0 }))
        return
      }
    }

    finishRun()
    finalizeMessage(assistantId)
  }

  const startBatch = (batchContinue?: { priorSteps: number }) =>
    window.api.agentRunStart(
      {
        query,
        sessionId,
        mode: mode ?? 'agent',
        userContext: {
          ...userContext,
          workspacePath: workspacePath ?? userContext.workspacePath ?? null,
        },
        images: batchContinue ? undefined : images,
        continueRun: batchContinue,
      },
      (step, maxSteps) => beginAgentStep(assistantId, step, maxSteps),
      (token) => appendAgentStreamToken(assistantId, token),
      (token) => appendAgentReasoningToken(assistantId, token),
      (usage) => setAgentContextUsage(usage),
      (question) => useUiStore.getState().setPendingAskQuestion(question),
      (request) => useUiStore.getState().setPendingSwitchMode(request),
      onBackgroundTask,
      (step, _max, thinking) => commitAgentStepThinking(assistantId, step, thinking),
      (event) => appendToolEvent(assistantId, event),
      (nextResult) => { void handleDone(nextResult) },
      handleError
    )

  setStop(await startBatch(continueRun))
}

function finalizeStreamingInSessions(
  sessions: ChatSession[],
  sessionId: string,
  messageId: string
): ChatSession[] {
  return patchSession(sessions, sessionId, (session) => ({
    ...session,
    messages: session.messages.map((m) =>
      m.id === messageId
        ? {
            ...m,
            isStreaming: false,
            streamingAgentStep: undefined,
            agentReasoningBuffer: undefined,
            agentStreamBuffer: undefined,
            agentProseBuffer: undefined,
          }
        : m
    ),
    updatedAt: Date.now(),
  }))
}

function commitProseBeforeTool(m: ChatMessage, step: number): ChatMessage {
  const prose = m.agentProseBuffer?.trim()
  if (!prose) return m
  const agentSteps = upsertAgentStep(m.agentSteps, step, { proseBlock: prose })
  return { ...m, agentSteps, agentProseBuffer: '' }
}

function applyToolEventToMessage(m: ChatMessage, event: AgentToolEvent): ChatMessage {
  const prevTools = flattenToolEvents(m.agentSteps)
  const prev = event.toolId ? prevTools.find((t) => t.toolId === event.toolId) : undefined
  const isNewTool = Boolean(event.toolId && !prev)
  let next = isNewTool ? commitProseBeforeTool(m, event.step) : m
  const merged: AgentToolEvent = {
    ...event,
    streamBody: event.streamBody ?? prev?.streamBody,
    startedAt: event.startedAt ?? prev?.startedAt,
    endedAt: event.status === 'done' ? Date.now() : prev?.endedAt,
  }
  const agentSteps = upsertAgentStep(next.agentSteps, event.step, { tool: merged })
  return {
    ...next,
    agentSteps,
    toolEvents: flattenToolEvents(agentSteps),
    agentHasToolActivity: true,
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  sessions: [],
  closedSessions: [],
  activeSessionId: null,
  isStreaming: false,
  streamingSessionId: null,
  streamingMessageId: null,
  stopFn: null,
  modelName: null,
  isModelLoaded: false,
  agentPromptTokens: null,
  activePlan: null,
  agentTodos: [],

  getActiveMessages: () => {
    const { sessions, activeSessionId } = get()
    return sessions.find((s) => s.id === activeSessionId)?.messages ?? []
  },

  forceAbortStream: () => {
    const { stopFn, streamingSessionId, streamingMessageId, sessions, activeSessionId, closedSessions } = get()
    useUiStore.getState().clearPendingAskQuestion()
    useUiStore.getState().clearPendingSwitchMode()
    stopFn?.()

    if (streamingSessionId && streamingMessageId) {
      const sessionsPatched = finalizeStreamingInSessions(
        sessions,
        streamingSessionId,
        streamingMessageId
      )
      set({
        sessions: sessionsPatched,
        isStreaming: false,
        stopFn: null,
        streamingSessionId: null,
        streamingMessageId: null,
      })
      scheduleSave({ sessions: sessionsPatched, activeSessionId, closedSessions })
    } else {
      set({
        isStreaming: false,
        stopFn: null,
        streamingSessionId: null,
        streamingMessageId: null,
      })
    }
  },

  createSession: () => {
    if (get().isStreaming) get().forceAbortStream()

    const id = String(_sessionId++)
    const session: ChatSession = {
      id,
      title: t.newChat,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => {
      const sessions = [...s.sessions, session]
      scheduleSave({ sessions, activeSessionId: id, closedSessions: s.closedSessions })
      return { sessions, activeSessionId: id, agentPromptTokens: null, activePlan: null, agentTodos: [] }
    })
    syncLlmHistory([])
    return id
  },

  setActiveSession: (id) => {
    const session = get().sessions.find((s) => s.id === id)
    if (!session || get().activeSessionId === id) return
    if (get().isStreaming) get().forceAbortStream()
    set({ activeSessionId: id, agentPromptTokens: null, activePlan: null, agentTodos: [] })
    syncLlmHistory(session.messages)
    scheduleSave({
      sessions: get().sessions,
      activeSessionId: id,
      closedSessions: get().closedSessions,
    })
  },

  restoreSession: (id) => {
    const session = get().closedSessions.find((s) => s.id === id)
    if (!session) return
    if (get().isStreaming) get().forceAbortStream()

    const closedSessions = get().closedSessions.filter((s) => s.id !== id)
    const sessions = [...get().sessions, session]
    set({ sessions, closedSessions, activeSessionId: id })
    syncLlmHistory(session.messages)
    scheduleSave({ sessions, activeSessionId: id, closedSessions })
  },

  closeSession: (id) => {
    const { sessions, closedSessions, activeSessionId, streamingSessionId } = get()
    const session = sessions.find((s) => s.id === id)
    if (!session) return

    void window.api.agentClearSession(id)

    if (streamingSessionId === id) {
      get().forceAbortStream()
    }

    const updatedSession = get().sessions.find((s) => s.id === id) ?? session
    const closedCandidate = { ...updatedSession, updatedAt: Date.now() }
    const nextClosed = countUserMessages(closedCandidate) > 0
      ? trimClosedSessions([closedCandidate, ...closedSessions.filter((s) => s.id !== id)])
      : closedSessions.filter((s) => s.id !== id)

    const remaining = get().sessions.filter((s) => s.id !== id)
    if (remaining.length === 0) {
      const newId = String(_sessionId++)
      const fresh: ChatSession = {
        id: newId,
        title: t.newChat,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set({ sessions: [fresh], closedSessions: nextClosed, activeSessionId: newId })
      syncLlmHistory([])
      scheduleSave({ sessions: [fresh], activeSessionId: newId, closedSessions: nextClosed })
      return
    }

    const nextActive = activeSessionId === id
      ? remaining[remaining.length - 1].id
      : activeSessionId

    set({ sessions: remaining, closedSessions: nextClosed, activeSessionId: nextActive })
    const active = remaining.find((s) => s.id === nextActive)!
    syncLlmHistory(active.messages)
    scheduleSave({ sessions: remaining, activeSessionId: nextActive, closedSessions: nextClosed })
  },

  addUserMessage: (content: string, attachments?: ChatMessageAttachment[]) => {
    const { activeSessionId } = get()
    if (!activeSessionId) return

    const msg: ChatMessage = {
      id: String(_msgId++),
      role: 'user',
      content,
      attachments: attachments?.length ? attachments : undefined,
      timestamp: Date.now(),
    }

    set((s) => {
      const sessions = patchSession(s.sessions, activeSessionId, (session) => {
        let title = session.title
        if (session.title === t.newChat) {
          if (content.trim()) title = titleFromPrompt(content)
          else if (attachments?.length) title = t.imageChatTitle
        }
        return {
          ...session,
          title,
          messages: [...session.messages, msg],
          updatedAt: Date.now(),
        }
      })
      scheduleSave({ sessions, activeSessionId, closedSessions: s.closedSessions })
      return { sessions }
    })
  },

  startAssistantMessage: () => {
    const { activeSessionId } = get()
    if (!activeSessionId) return ''

    const id = String(_msgId++)
    const msg: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }

    set((s) => ({
      sessions: patchSession(s.sessions, activeSessionId, (session) => ({
        ...session,
        messages: [...session.messages, msg],
        updatedAt: Date.now(),
      })),
      isStreaming: true,
      streamingSessionId: activeSessionId,
      streamingMessageId: id,
    }))
    return id
  },

  appendToken: (id: string, token: string) => {
    const { streamingSessionId } = get()
    if (!streamingSessionId) return

    set((s) => ({
      sessions: patchSession(s.sessions, streamingSessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) =>
          m.id === id ? { ...m, content: m.content + token } : m
        ),
      })),
    }))
  },

  beginAgentStep: (messageId: string, step: number, maxSteps?: number) => {
    const { streamingSessionId, activeSessionId } = get()
    const sessionId = streamingSessionId ?? activeSessionId
    if (!sessionId) return

    set((s) => ({
      sessions: patchSession(s.sessions, sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) => {
          if (m.id !== messageId) return m
          let next = m
          if (step > 1) {
            const prose = m.agentProseBuffer?.trim()
            if (prose) {
              const agentSteps = upsertAgentStep(m.agentSteps, step - 1, { proseBlock: prose })
              next = { ...m, agentSteps, agentProseBuffer: '' }
            }
          }
          return {
            ...next,
            agentStreamBuffer: '',
            agentReasoningBuffer: '',
            streamingAgentStep: step,
            agentMaxSteps: maxSteps ?? m.agentMaxSteps,
            thinkingStartedAt: Date.now(),
          }
        }),
      })),
    }))
  },

  appendAgentReasoningToken: (messageId: string, token: string) => {
    const { streamingSessionId, activeSessionId } = get()
    const sessionId = streamingSessionId ?? activeSessionId
    if (!sessionId) return

    queueReasoningToken(messageId, token, (id, batch) => {
      set((s) => ({
        sessions: patchSession(s.sessions, sessionId, (session) => ({
          ...session,
          messages: session.messages.map((m) =>
            m.id === id
              ? {
                  ...m,
                  agentReasoningBuffer: (m.agentReasoningBuffer ?? '') + batch,
                  thinkingStartedAt: m.thinkingStartedAt ?? Date.now(),
                }
              : m
          ),
        })),
      }))
    })
  },

  setAgentContextUsage: (usage) => {
    if (usage.promptTokens > 0) {
      set({ agentPromptTokens: usage.promptTokens })
    }
  },

  setActivePlan: (plan) => set({ activePlan: plan }),

  clearActivePlan: () => set({ activePlan: null }),

  setAgentTodos: (todos) => set({ agentTodos: todos }),

  clearAgentTodos: () => set({ agentTodos: [] }),

  appendAgentStreamToken: (messageId: string, token: string) => {
    const { streamingSessionId, activeSessionId } = get()
    const sessionId = streamingSessionId ?? activeSessionId
    if (!sessionId) return

    set((s) => ({
      sessions: patchSession(s.sessions, sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) => {
          if (m.id !== messageId) return m
          const buf = (m.agentStreamBuffer ?? '') + token
          if (looksLikeAgentStepBuffer(buf)) {
            return { ...m, agentStreamBuffer: buf }
          }
          const prose = (m.agentProseBuffer ?? '') + token
          return {
            ...m,
            agentStreamBuffer: buf,
            agentProseBuffer: prose,
          }
        }),
      })),
    }))
  },

  commitAgentStepThinking: (messageId: string, step: number, thinking: string | null) => {
    const { streamingSessionId, activeSessionId } = get()
    const sessionId = streamingSessionId ?? activeSessionId
    if (!sessionId) return

    flushReasoningTokens(messageId, (id, batch) => {
      set((s) => ({
        sessions: patchSession(s.sessions, sessionId, (session) => ({
          ...session,
          messages: session.messages.map((m) =>
            m.id === id
              ? {
                  ...m,
                  agentReasoningBuffer: (m.agentReasoningBuffer ?? '') + batch,
                }
              : m
          ),
        })),
      }))
    })

    set((s) => ({
      sessions: patchSession(s.sessions, sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) => {
          if (m.id !== messageId) return m
          const mergedThinking =
            thinking?.trim() ||
            m.agentReasoningBuffer?.trim() ||
            null
          const agentSteps = mergedThinking
            ? upsertAgentStep(m.agentSteps, step, { thinking: mergedThinking })
            : m.agentSteps
          return {
            ...m,
            agentSteps,
            agentStreamBuffer: '',
            agentReasoningBuffer: '',
          }
        }),
        updatedAt: Date.now(),
      })),
    }))
  },

  appendToolEvent: (messageId: string, event: AgentToolEvent) => {
    const { streamingSessionId, activeSessionId } = get()
    const sessionId = streamingSessionId ?? activeSessionId
    if (!sessionId) return

    const applySideEffects = (ev: AgentToolEvent) => {
      if (ev.status === 'done' && (ev.filePath || ev.directoryPath)) {
        void useWorkspaceStore.getState().refreshTree()
      }

      if (ev.name === 'TodoWrite' && ev.status === 'done' && !ev.isError) {
        try {
          const parsed = JSON.parse(ev.result) as { ok?: boolean; todos?: AgentTodoItem[] }
          if (parsed.ok && Array.isArray(parsed.todos)) {
            get().setAgentTodos(parsed.todos)
          }
        } catch { /* ignore malformed todo payload */ }
      }

      if (ev.name === 'CreatePlan' && ev.status === 'done' && !ev.isError) {
        try {
          const parsed = JSON.parse(ev.result) as {
            ok?: boolean
            name?: string
            overview?: string
            plan?: string
            filePath?: string
            todos?: Array<{ id: string; content: string }>
          }
          if (parsed.ok && parsed.plan) {
            get().setActivePlan({
              name: parsed.name,
              overview: parsed.overview,
              plan: parsed.plan,
              todos: parsed.todos,
              filePath: parsed.filePath ?? ev.filePath,
            })
          }
        } catch { /* ignore malformed plan payload */ }
      }
    }

    const flushTool = (id: string, ev: AgentToolEvent) => {
      if (ev.status === 'done') applySideEffects(ev)

      set((s) => {
        let shouldSave = false
        const sessions = patchSession(s.sessions, sessionId, (session) => ({
          ...session,
          messages: session.messages.map((m) => {
            if (m.id !== id) return m
            shouldSave = !m.isStreaming || ev.status === 'done'
            return applyToolEventToMessage(m, ev)
          }),
          updatedAt: Date.now(),
        }))
        if (shouldSave) {
          scheduleSave({
            sessions,
            activeSessionId: s.activeSessionId,
            closedSessions: s.closedSessions,
          })
        }
        return { sessions }
      })
    }

    queueToolEvent(messageId, event, flushTool, event.status === 'done')
  },

  appendShellOutputToTool: (messageId: string, _command: string, data: string) => {
    const { streamingSessionId, activeSessionId } = get()
    const sessionId = streamingSessionId ?? activeSessionId
    if (!sessionId || !data) return

    set((s) => ({
      sessions: patchSession(s.sessions, sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) => {
          if (m.id !== messageId) return m
          const steps = m.agentSteps ?? []
          let target: { stepIdx: number; toolIdx: number } | null = null

          for (let si = steps.length - 1; si >= 0; si--) {
            const tools = steps[si]?.tools ?? []
            for (let ti = tools.length - 1; ti >= 0; ti--) {
              const tool = tools[ti]!
              if (
                (tool.name === 'Shell' || tool.name === 'AwaitShell') &&
                tool.status === 'pending'
              ) {
                target = { stepIdx: si, toolIdx: ti }
                break
              }
            }
            if (target) break
          }

          if (!target) return m

          const nextSteps = steps.map((step, si) => {
            if (si !== target!.stepIdx) return step
            return {
              ...step,
              tools: step.tools.map((tool, ti) => {
                if (ti !== target!.toolIdx) return tool
                const cmd = typeof tool.arguments.command === 'string' ? tool.arguments.command : ''
                const prev = tool.streamBody ?? (cmd ? `$ ${cmd}\n` : '')
                return { ...tool, streamBody: prev + data }
              }),
            }
          })

          return {
            ...m,
            agentSteps: nextSteps,
            toolEvents: flattenToolEvents(nextSteps),
          }
        }),
      })),
    }))
  },

  finalizeMessage: (id: string) => {
    const { streamingSessionId, activeSessionId, closedSessions } = get()
    const sessionId = streamingSessionId ?? activeSessionId
    if (!sessionId) return

    flushReasoningTokens(id, (msgId, batch) => {
      set((s) => ({
        sessions: patchSession(s.sessions, sessionId, (session) => ({
          ...session,
          messages: session.messages.map((m) =>
            m.id === msgId
              ? { ...m, agentReasoningBuffer: (m.agentReasoningBuffer ?? '') + batch }
              : m
          ),
        })),
      }))
    })
    flushPendingToolEvents((msgId, ev) => {
      if (msgId !== id) return
      set((s) => ({
        sessions: patchSession(s.sessions, sessionId, (session) => ({
          ...session,
          messages: session.messages.map((m) =>
            m.id === msgId ? applyToolEventToMessage(m, ev) : m
          ),
          updatedAt: Date.now(),
        })),
      }))
    })

    set((s) => {
      const sessions = finalizeStreamingInSessions(s.sessions, sessionId, id)
      scheduleSave({ sessions, activeSessionId: s.activeSessionId, closedSessions })
      return {
        sessions,
        isStreaming: false,
        stopFn: null,
        streamingSessionId: null,
        streamingMessageId: null,
      }
    })
  },

  setStop: (fn) => set({ stopFn: fn }),

  stop: () => {
    get().forceAbortStream()
  },

  loadSessions: async () => {
    try {
      const data = await window.api.loadChatSessions()
      let { sessions, activeSessionId, closedSessions } = data
      const rawClosed = closedSessions ?? []
      closedSessions = trimClosedSessions(rawClosed)

      if (sessions.length === 0) {
        const id = String(_sessionId++)
        sessions = [{
          id,
          title: t.newChat,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }]
        activeSessionId = id
        scheduleSave({ sessions, activeSessionId, closedSessions })
      } else {
        const maxSession = Math.max(
          ...sessions.map((s) => Number(s.id)),
          ...closedSessions.map((s) => Number(s.id)),
          0
        )
        const maxMsg = sessions.flatMap((s) => s.messages).reduce((m, msg) => Math.max(m, Number(msg.id)), 0)
        _sessionId = Math.max(_sessionId, maxSession + 1)
        _msgId = Math.max(_msgId, maxMsg + 1)
      }

      if (!activeSessionId || !sessions.some((s) => s.id === activeSessionId)) {
        activeSessionId = sessions[0].id
      }

      if (closedSessions.length !== rawClosed.length) {
        scheduleSave({ sessions, activeSessionId, closedSessions })
      }

      const active = sessions.find((s) => s.id === activeSessionId)!
      set({ sessions, activeSessionId, closedSessions })
      syncLlmHistory(active.messages)
    } catch { /* non-fatal */ }
  },

  setModelStatus: (loaded: boolean, name: string | null) =>
    set({ isModelLoaded: loaded, modelName: name }),

  sendMessage: async (userPrompt, workspacePath, options) => {
    const { addUserMessage, startAssistantMessage, appendToken, finalizeMessage, setStop, activeSessionId } = get()
    if (!get().isModelLoaded || !activeSessionId) return

    const displayText = options?.displayText ?? userPrompt
    addUserMessage(displayText, options?.displayAttachments)
    const assistantId = startAssistantMessage()
    if (!assistantId) return

    const onDone = async () => {
      finalizeMessage(assistantId)
      const msg = get().getActiveMessages().find((m) => m.id === assistantId)
      if (msg) {
        for (const { filePath, code } of extractFileBlocks(msg.content)) {
          const fullPath = resolvePath(filePath, workspacePath)
          if (fullPath) {
            try { await window.api.writeFile(fullPath, code) } catch { /* ignore */ }
          }
        }
      }
    }

    const cancel = await window.api.generateStream(
      userPrompt,
      { images: options?.images },
      (token) => appendToken(assistantId, token),
      onDone,
      (err) => {
        appendToken(assistantId, `\n\n${t.errorPrefix(err)}`)
        finalizeMessage(assistantId)
      }
    )
    setStop(cancel)
  },

  sendAgentMessage: async (userPrompt, workspacePath, userContext, options) => {
    const { addUserMessage, startAssistantMessage, activeSessionId } = get()
    if (!get().isModelLoaded || !activeSessionId) return

    const displayText = options?.displayText ?? userPrompt
    addUserMessage(displayText, options?.displayAttachments)
    const assistantId = startAssistantMessage()
    if (!assistantId) return

    const sessionId = options?.sessionId ?? activeSessionId
    await launchAgentSessionRun(get, set, {
      assistantId,
      sessionId,
      query: userPrompt,
      workspacePath,
      userContext,
      mode: options?.mode,
      images: options?.images,
    })
  },

  continueAgentRun: async (assistantMessageId, workspacePath, userContext, options) => {
    const { activeSessionId } = get()
    if (!get().isModelLoaded || !activeSessionId || get().isStreaming) return

    const session = get().sessions.find((s) => s.id === activeSessionId)
    if (!session) return

    const msgIndex = session.messages.findIndex((m) => m.id === assistantMessageId)
    const msg = msgIndex >= 0 ? session.messages[msgIndex] : undefined
    if (!msg?.agentCanContinue) return

    let query = ''
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (session.messages[i]?.role === 'user') {
        query = session.messages[i]!.content
        break
      }
    }

    const sessionId = options?.sessionId ?? activeSessionId
    set({
      isStreaming: true,
      streamingSessionId: sessionId,
      streamingMessageId: assistantMessageId,
      sessions: patchSession(get().sessions, sessionId, (sess) => ({
        ...sess,
        messages: sess.messages.map((m) =>
          m.id === assistantMessageId
            ? { ...m, isStreaming: true, agentCanContinue: false }
            : m
        ),
      })),
    })

    await launchAgentSessionRun(get, set, {
      assistantId: assistantMessageId,
      sessionId,
      query,
      workspacePath,
      userContext,
      mode: options?.mode,
      continueRun: { priorSteps: msg.agentTotalSteps ?? 0 },
    })
  },

  rollbackToUserMessage: async (messageIndex, workspacePath) => {
    if (get().isStreaming) get().forceAbortStream()

    const { activeSessionId, closedSessions } = get()
    if (!activeSessionId) return

    const session = get().sessions.find((s) => s.id === activeSessionId)
    if (!session) return

    const target = session.messages[messageIndex]
    if (!target || target.role !== 'user') return

    const removed = session.messages.slice(messageIndex)
    await revertAgentChanges(removed, workspacePath, {
      writeFile: window.api.writeFile,
      deleteFile: window.api.deleteFile,
      removeEmptyDir: window.api.removeEmptyDir,
    })
    void useWorkspaceStore.getState().refreshTree()

    const truncated = session.messages.slice(0, messageIndex)
    set((s) => ({
      sessions: patchSession(s.sessions, activeSessionId, (sess) => ({
        ...sess,
        messages: truncated,
        updatedAt: Date.now(),
      })),
      agentPromptTokens: null,
      activePlan: null,
      agentTodos: [],
    }))
    syncLlmHistory(truncated)
    void window.api.agentClearSession(activeSessionId)
    scheduleSave({
      sessions: get().sessions,
      activeSessionId,
      closedSessions,
    })
    useUiStore.getState().setStatusMessage(t.rollbackDone, 3000)
  },

  editUserMessageAndResend: async (messageIndex, newText, workspacePath, userContext, options) => {
    if (get().isStreaming) get().forceAbortStream()

    const { activeSessionId, closedSessions } = get()
    if (!activeSessionId) return

    const session = get().sessions.find((s) => s.id === activeSessionId)
    if (!session) return

    const target = session.messages[messageIndex]
    if (!target || target.role !== 'user') return

    const removed = session.messages.slice(messageIndex + 1)
    await revertAgentChanges(removed, workspacePath, {
      writeFile: window.api.writeFile,
      deleteFile: window.api.deleteFile,
      removeEmptyDir: window.api.removeEmptyDir,
    })
    void useWorkspaceStore.getState().refreshTree()

    const truncated = session.messages.slice(0, messageIndex + 1).map((m, idx) =>
      idx === messageIndex
        ? {
            ...m,
            content: newText,
            attachments: options?.displayAttachments ?? m.attachments,
          }
        : m
    )

    set((s) => ({
      sessions: patchSession(s.sessions, activeSessionId, (sess) => ({
        ...sess,
        messages: truncated,
        updatedAt: Date.now(),
      })),
      agentPromptTokens: null,
      activePlan: null,
      agentTodos: [],
    }))
    syncLlmHistory(truncated)
    void window.api.agentClearSession(activeSessionId)
    scheduleSave({
      sessions: get().sessions,
      activeSessionId,
      closedSessions,
    })

    const { startAssistantMessage } = get()

    const sessionId = options?.sessionId ?? activeSessionId
    const assistantId = startAssistantMessage()
    if (!assistantId) return

    await launchAgentSessionRun(get, set, {
      assistantId,
      sessionId,
      query: newText,
      workspacePath,
      userContext,
      mode: options?.mode,
      images: options?.images,
    })
  },

  editChatUserMessage: async (messageIndex, newText, workspacePath, options) => {
    if (get().isStreaming) get().forceAbortStream()

    const { activeSessionId, closedSessions } = get()
    if (!activeSessionId) return

    const session = get().sessions.find((s) => s.id === activeSessionId)
    if (!session) return

    const target = session.messages[messageIndex]
    if (!target || target.role !== 'user') return

    const removed = session.messages.slice(messageIndex + 1)
    await revertAgentChanges(removed, workspacePath, {
      writeFile: window.api.writeFile,
      deleteFile: window.api.deleteFile,
      removeEmptyDir: window.api.removeEmptyDir,
    })
    void useWorkspaceStore.getState().refreshTree()

    const truncated = session.messages.slice(0, messageIndex + 1).map((m, idx) =>
      idx === messageIndex
        ? {
            ...m,
            content: newText,
            attachments: options?.displayAttachments ?? m.attachments,
          }
        : m
    )

    set((s) => ({
      sessions: patchSession(s.sessions, activeSessionId, (sess) => ({
        ...sess,
        messages: truncated,
        updatedAt: Date.now(),
      })),
    }))
    syncLlmHistory(truncated)
    scheduleSave({
      sessions: get().sessions,
      activeSessionId,
      closedSessions,
    })

    const { startAssistantMessage, appendToken, finalizeMessage, setStop } = get()
    const assistantId = startAssistantMessage()
    if (!assistantId) return

    const onDone = async () => {
      finalizeMessage(assistantId)
      const msg = get().getActiveMessages().find((m) => m.id === assistantId)
      if (msg) {
        for (const { filePath, code } of extractFileBlocks(msg.content)) {
          const fullPath = resolvePath(filePath, workspacePath)
          if (fullPath) {
            try { await window.api.writeFile(fullPath, code) } catch { /* ignore */ }
          }
        }
      }
    }

    const cancel = await window.api.generateStream(
      newText,
      { images: options?.images },
      (token) => appendToken(assistantId, token),
      onDone,
      (err) => {
        appendToken(assistantId, `\n\n${t.errorPrefix(err)}`)
        finalizeMessage(assistantId)
      }
    )
    setStop(cancel)
  },
}))
