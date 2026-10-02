import type { AgentStepEntry } from './agent/agentSteps'
import type { AgentChatMessage } from './agent/agentChatMessages'
import type { AgentPlanPayload, AgentTodoItem, AgentToolEvent, ComposerMode } from './agent/types'

// ── File System ───────────────────────────────────────────────────────────────

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface FileEvent {
  type: 'created' | 'deleted' | 'changed' | 'renamed'
  path: string
  newPath?: string
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export interface WorkspaceInfo {
  name: string
  path: string
}

export interface RecentWorkspace {
  path: string
  lastOpenedAt: string
}

export interface RecentWorkspaceInfo extends WorkspaceInfo {
  lastOpenedAt: string
}

// ── Editor ────────────────────────────────────────────────────────────────────

export interface EditorTab {
  id: string
  filePath: string
  fileName: string
  language: string
  isDirty: boolean
}

// ── API Models ────────────────────────────────────────────────────────────────

export type ApiAuthType = 'none' | 'auto' | 'bearer' | 'raw' | 'x-api-key'

export interface ApiModelConfig {
  id: string
  displayName: string
  modelName: string
  url: string
  token: string
  authType: ApiAuthType
  contextSize: number
  /** Max completion tokens — sent as max_tokens only when customizeApiParams is true. */
  maxOutputTokens: number
  /** When false, API body is Cursor-like: model, messages, stream only (+ stream_options). */
  customizeApiParams: boolean
  temperature: number
  topP: number
  /** 0 = do not send top_k */
  topK: number
  /** 0 = do not send min_p */
  minP: number
  /** 1.0 = do not send repetition_penalty */
  repetitionPenalty: number
}

export interface ApiModelInput {
  displayName: string
  modelName: string
  url: string
  token: string
  authType: ApiAuthType
  contextSize: number
  maxOutputTokens: number
  customizeApiParams: boolean
  temperature: number
  topP: number
  topK: number
  minP: number
  repetitionPenalty: number
}

export interface ImageAttachment {
  path: string
  name: string
  mimeType: string
  base64: string
}

export interface GenerateOptions {
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
  images?: ImageAttachment[]
  /** OpenAI function tool schemas for native agent completions. */
  tools?: unknown[]
  onReasoningToken?: (token: string) => void
  onToolCallDelta?: (
    calls: Array<{ index: number; id?: string; name?: string; argumentsPartial: string }>
  ) => void
  /** When true, in-flight LLM streams abort promptly. */
  isAborted?: () => boolean
}

export interface FimRequest {
  prefix: string
  suffix: string
  language: string
  maxTokens?: number
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessageAttachment {
  kind?: 'image' | 'file'
  name: string
  mimeType: string
  /** Image/PDF preview data URL. */
  dataUrl?: string
  /** Absolute path for file-reference attachments. */
  path?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: ChatMessageAttachment[]
  /** Interleaved orchestrator steps: thinking → tools per loop iteration. */
  agentSteps?: AgentStepEntry[]
  /** @deprecated use agentSteps */
  toolEvents?: AgentToolEvent[]
  /** @deprecated use agentSteps */
  thinkingBlocks?: string[]
  /** Live stream buffer for current agent step (assistant content tokens). */
  agentStreamBuffer?: string
  /** Live reasoning stream from `reasoning_content` (native tools). */
  agentReasoningBuffer?: string
  /** Orchestrator step currently streaming (1-based). */
  streamingAgentStep?: number
  /** Max steps from agent settings for step divider UI. */
  agentMaxSteps?: number
  /** Manual continue available after batch pause. */
  agentCanContinue?: boolean
  agentPauseReason?: string
  /** Cumulative agent steps across auto-continue batches. */
  agentTotalSteps?: number
  /** Buffered final prose while tools run (shown after tools complete). */
  agentProseBuffer?: string
  /** True once any tool activity started this turn. */
  agentHasToolActivity?: boolean
  /** Timestamp when live reasoning started (for duration label). */
  thinkingStartedAt?: number
  isStreaming?: boolean
  timestamp?: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  /** Per-tab composer mode (Agent / Plan / Ask / Chat). */
  composerMode?: ComposerMode
  /** Last known prompt token count for the context meter. */
  agentPromptTokens?: number | null
  activePlan?: AgentPlanPayload | null
  agentTodos?: AgentTodoItem[]
  /** Full agent API conversation — restored to main process after restart. */
  agentMessages?: AgentChatMessage[]
}

export interface ChatSessionsData {
  sessions: ChatSession[]
  activeSessionId: string | null
  closedSessions: ChatSession[]
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface AppSettings {
  theme: 'dark' | 'light'
  recentWorkspaces: RecentWorkspace[]
  lastWorkspacePath: string | null
  apiModels: ApiModelConfig[]
  activeModelId: string | null
  editorFontSize: number
  editorTabSize: number
  sidebarWidth: number
  aiPanelWidth: number
  terminalHeight: number
  /** Agent: auto-apply Write/StrReplace/Delete (default true). */
  agentAutoApply: boolean
  /** Agent: LLM turns per batch before pause/continue (default 50). */
  agentMaxSteps: number
  /** Agent: max wall time per batch, minutes (default 60). */
  agentMaxWallTimeMin: number
  /** Agent: auto-continue next batch when soft limit hit (default true). */
  agentAutoContinue: boolean
  /** @deprecated use agentSummarizeAtPercent */
  agentContextStopPercent: number
  /** Agent: LLM summarization of middle history when context is full. */
  agentSummarizeEnabled: boolean
  /** Agent: summarize when prompt tokens exceed this % of model context. */
  agentSummarizeAtPercent: number
  /** Agent: target summary length ratio (0.2 ≈ 80% compression). */
  agentSummarizeTargetRatio: number
  /** Agent: keep last N user turns verbatim after summarization. */
  agentSummarizeKeepRecentTurns: number
  /** Agent: auto-continue after summarize vs pause batch. */
  agentSummarizeMode: import('./agent/agentSettings').AgentSummarizeMode
  /** Agent: truncate tool bodies before summary LLM call. */
  agentSummarizePreSqueeze: boolean
  /** Agent: model id for summary calls; null = active model. */
  agentSummarizeModelId: string | null
  /** Optional Tavily API key for WebSearch (free tier: 1000/month). Keyless works without it. */
  tavilyApiKey: string
  /** Internal: agent limits migration version. */
  agentLimitsVersion?: number
}
