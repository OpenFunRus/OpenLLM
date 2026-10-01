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
  /** Pause batch when prompt tokens exceed this % of model context. */
  agentContextStopPercent: 92,
} as const

/** Absolute safety caps — not exposed in Settings UI. */
export const AGENT_HARD_LIMITS = {
  maxSteps: 500,
} as const

export type AgentPauseReason = 'batch_steps' | 'wall_time' | 'context' | 'hard_limit'

export type AgentSettingsKeys = keyof typeof AGENT_SETTINGS_DEFAULTS
