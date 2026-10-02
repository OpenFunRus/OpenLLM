/** JSON Schema subset used in Cursor tool definitions. */
export type JsonSchema = {
  type?: string
  description?: string
  enum?: readonly string[]
  minimum?: number
  maximum?: number
  minItems?: number
  items?: JsonSchema | JsonSchema[]
  properties?: Record<string, JsonSchema>
  required?: readonly string[]
  [key: string]: unknown
}

/** OpenAI-style function tool schema as embedded in Cursor system prompt `<tools>`. */
export type CursorToolFunctionSchema = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonSchema
  }
}

export type AgentMode = 'agent' | 'plan' | 'chat'

/** Parsed tool call (native OpenAI or legacy XML). */
export type ParsedToolCall = {
  name: string
  arguments: Record<string, unknown>
  toolCallId?: string
}

/** Result returned to the model after tool execution. */
export type ToolResult = {
  toolCallId?: string
  name: string
  content: string
  isError?: boolean
  /** Absolute path for file mutations (Write / StrReplace / Delete). */
  filePath?: string
  oldContent?: string
  newContent?: string
  /** Absolute path when Shell created a directory. */
  directoryPath?: string
}

export type ToolPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type ToolRegistryEntry = {
  schema: CursorToolFunctionSchema
  priority: ToolPriority
  /** Whether implementation exists in OpenLLM (Stage 2+). */
  implemented: boolean
}

export type AgentExecuteToolPayload = {
  name: string
  arguments: Record<string, unknown>
  toolCallId?: string
  sessionId?: string
  mode?: AgentMode
}

export type AgentOpenFileInfo = {
  path: string
  isActive?: boolean
  cursorLine?: number
}

export type AgentSkillInfo = {
  fullPath: string
  description: string
}

export type DynamicToolNamespaceInfo = {
  name: string
  tools: string
  source?: string
}

/** Context from renderer + enriched in main before each agent turn. */
export type AgentUserContext = {
  workspacePath: string | null
  isGitRepo?: boolean | null
  gitBranch?: string | null
  openFiles?: AgentOpenFileInfo[]
  recentlyViewedFiles?: string[]
  timezoneOffsetMinutes?: number
  terminalsFolder?: string
  agentTranscriptsPath?: string | null
  agentSkills?: AgentSkillInfo[]
  dynamicToolNamespaces?: DynamicToolNamespaceInfo[]
}

export type AskQuestionOption = {
  id: string
  label: string
}

export type AskQuestionItem = {
  id: string
  prompt: string
  options: AskQuestionOption[]
  allow_multiple?: boolean
}

export type AskQuestionPayload = {
  title?: string
  questions: AskQuestionItem[]
}

export type AskQuestionAnswer = {
  questionId: string
  selectedOptionIds: string[]
  otherText?: string
}

export type AskQuestionAnswers = {
  answers: AskQuestionAnswer[]
}

export type PendingAskQuestion = AskQuestionPayload & {
  runId: string
  requestId: string
}

export type SwitchModePayload = {
  targetModeId: AgentMode
  explanation?: string
}

export type SwitchModeResult = {
  approved: boolean
  targetModeId: AgentMode
}

export type PendingSwitchMode = SwitchModePayload & {
  runId: string
  requestId: string
}

export type ComposerMode = AgentMode

/** Migrate persisted session modes (legacy ask + old plain-chat composer). */
export function normalizeComposerMode(mode?: string | null): ComposerMode {
  if (mode === 'ask' || mode === 'chat') return 'chat'
  if (mode === 'plan') return 'plan'
  return 'agent'
}

export type AgentRunContinue = {
  /** Steps already completed in prior batches for this assistant turn. */
  priorSteps: number
}

export type AgentRunPayload = {
  query: string
  sessionId: string
  runId?: string
  mode?: AgentMode
  userContext: AgentUserContext
  images?: import('../types').ImageAttachment[]
  /** Restrict tool execution for local subagents. */
  allowedTools?: readonly string[]
  /** Resume agent loop without adding a new user turn. */
  continueRun?: AgentRunContinue
  /** UI chat fallback when agentMessages were not persisted (legacy sessions). */
  priorChatTurns?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type AgentToolEvent = {
  step: number
  name: string
  arguments: Record<string, unknown>
  result: string
  isError?: boolean
  filePath?: string
  oldContent?: string
  newContent?: string
  directoryPath?: string
  /** Stable id within a run — pending + done updates the same bubble. */
  toolId?: string
  status?: 'pending' | 'done'
  /** Live output / preview text (shell log, partial args, etc.). */
  streamBody?: string
  startedAt?: number
  endedAt?: number
}

export type AgentCompletionUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type AgentTodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export type AgentTodoItem = {
  id: string
  content: string
  status: AgentTodoStatus
}

export type AgentPlanPayload = {
  name?: string
  overview?: string
  plan: string
  todos?: Array<{ id: string; content: string }>
  filePath?: string
}

export type AgentRunResult = {
  finalText: string
  steps: number
  toolEvents: AgentToolEvent[]
  usage?: AgentCompletionUsage
  /** Soft limit hit — run can resume with continueRun. */
  paused?: boolean
  pauseReason?: import('./agentSettings').AgentPauseReason
  canContinue?: boolean
  /** Cumulative steps across batches for this assistant turn. */
  totalSteps?: number
}
