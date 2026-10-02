export type AgentSummarizeMode = 'auto' | 'pause'

/** Defaults for Agent mode — persisted in AppSettings (Settings UI). */
export const AGENT_SETTINGS_DEFAULTS = {
  /** Write/StrReplace/Delete через tools без подтверждения. */
  agentAutoApply: true,
  /** LLM turns per batch before pause/continue (Cursor-like soft limit). */
  agentMaxSteps: 50,
  /** Wall-clock limit per batch, minutes. */
  agentMaxWallTimeMin: 60,
  /** Auto-continue next batch when soft limit hit (default on). */
  agentAutoContinue: true,
  /** @deprecated use agentSummarizeAtPercent — kept for settings migration */
  agentContextStopPercent: 92,
  /** LLM context summarization when usage exceeds threshold. */
  agentSummarizeEnabled: true,
  /** Trigger summarization at this % of model context window. */
  agentSummarizeAtPercent: 90,
  /** Target summary size as ratio of compressed segment (0.2 ≈ 80% reduction). */
  agentSummarizeTargetRatio: 0.2,
  /** Recent conversation turns kept verbatim after summarization. */
  agentSummarizeKeepRecentTurns: 3,
  /** auto = summarize and continue; pause = summarize then pause batch if still over limit. */
  agentSummarizeMode: 'auto' as AgentSummarizeMode,
  /** Pre-truncate tool outputs in summary input (does not mutate stored history). */
  agentSummarizePreSqueeze: true,
  /** Optional model id for summary calls; null = active model. */
  agentSummarizeModelId: null as string | null,
} as const

/** Absolute safety caps — not exposed in Settings UI. */
export const AGENT_HARD_LIMITS = {
  maxSteps: 500,
} as const

export type AgentPauseReason = 'batch_steps' | 'wall_time' | 'context' | 'hard_limit'

export type AgentSettingsKeys = keyof typeof AGENT_SETTINGS_DEFAULTS
