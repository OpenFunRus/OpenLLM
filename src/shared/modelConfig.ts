export const MODEL_CONTEXT_MIN_K = 4
export const MODEL_CONTEXT_MAX_K = 1024
export const MODEL_CONTEXT_STEP_K = 4
export const MODEL_CONTEXT_DEFAULT_K = 200

/** Max completion tokens per LLM request (agent step / chat reply). */
export const MODEL_OUTPUT_MIN = 512
export const MODEL_OUTPUT_MAX = 65536
export const MODEL_OUTPUT_STEP = 512
/** Default when API override is enabled (max_tokens in request). */
export const MODEL_OUTPUT_DEFAULT = 4096

/** Trim reserve when max_tokens is not sent — Cursor leaves length to the server. */
export const MODEL_OUTPUT_RESERVE_DEFAULT = 8192

/** Нормализует значение контекста в K (4, 8, 12 … 1024). */
export function normalizeModelContextK(value?: number): number {
  if (!value || !Number.isFinite(value)) return MODEL_CONTEXT_DEFAULT_K

  let k = value
  if (value > MODEL_CONTEXT_MAX_K) {
    k = Math.round(value / 1000)
  }

  k = Math.round(k / MODEL_CONTEXT_STEP_K) * MODEL_CONTEXT_STEP_K
  return Math.min(MODEL_CONTEXT_MAX_K, Math.max(MODEL_CONTEXT_MIN_K, k))
}

export function formatModelContextLabel(k: number): string {
  return `${normalizeModelContextK(k)}K`
}

export function contextKToTokens(k: number): number {
  return normalizeModelContextK(k) * 1000
}

export function normalizeModelOutputTokens(value?: number): number {
  if (!value || !Number.isFinite(value)) return MODEL_OUTPUT_DEFAULT

  const n = Math.round(value / MODEL_OUTPUT_STEP) * MODEL_OUTPUT_STEP
  return Math.min(MODEL_OUTPUT_MAX, Math.max(MODEL_OUTPUT_MIN, n))
}

export function formatModelOutputLabel(tokens: number): string {
  const n = normalizeModelOutputTokens(tokens)
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)
}

export function resolveModelAuthType(
  authType: string | undefined,
  hasToken: boolean
): 'none' | 'bearer' | 'raw' | 'x-api-key' {
  if (authType === 'none' || (!authType && !hasToken)) return 'none'
  if (authType === 'bearer' || authType === 'raw' || authType === 'x-api-key') return authType
  return hasToken ? 'x-api-key' : 'none'
}
