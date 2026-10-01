import type { ApiModelConfig } from './types'
import {
  MODEL_OUTPUT_RESERVE_DEFAULT,
  normalizeModelOutputTokens,
} from './modelConfig'

/**
 * Defaults when API override is enabled (Dirk / llama.cpp server defaults when not sent):
 * @see docs/llms/u24r3090.md
 * @see docs/cursor/cursor-parity-roadmap.md
 */
export const MODEL_SAMPLING_DEFAULTS = {
  customizeApiParams: false,
  temperature: 0.8,
  topP: 0.95,
  topK: 20,
  minP: 0,
  repetitionPenalty: 1.0,
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizeModelSamplingFields(model: Partial<ApiModelConfig>): {
  customizeApiParams: boolean
  maxOutputTokens: number
  temperature: number
  topP: number
  topK: number
  minP: number
  repetitionPenalty: number
} {
  return {
    customizeApiParams: Boolean(model.customizeApiParams),
    maxOutputTokens: normalizeModelOutputTokens(model.maxOutputTokens),
    temperature: clamp(Number(model.temperature ?? MODEL_SAMPLING_DEFAULTS.temperature), 0, 2),
    topP: clamp(Number(model.topP ?? MODEL_SAMPLING_DEFAULTS.topP), 0, 1),
    topK: clamp(Math.round(Number(model.topK ?? MODEL_SAMPLING_DEFAULTS.topK)), 0, 500),
    minP: clamp(Number(model.minP ?? MODEL_SAMPLING_DEFAULTS.minP), 0, 1),
    repetitionPenalty: clamp(
      Number(model.repetitionPenalty ?? MODEL_SAMPLING_DEFAULTS.repetitionPenalty),
      0.5,
      2
    ),
  }
}

export type ChatCompletionPayloadOptions = {
  maxTokensOverride?: number
  stopSequences?: string[]
  /** OpenAI-style function tools (native agent mode). */
  tools?: unknown[]
}

/** Cursor-like baseline: model, messages, stream (+ stream_options). Override adds max_tokens + sampling. */
export function buildChatCompletionPayload(
  config: ApiModelConfig,
  messages: unknown[],
  stream: boolean,
  opts: ChatCompletionPayloadOptions = {}
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.modelName,
    messages,
    stream,
  }

  if (stream) {
    body.stream_options = { include_usage: true }
  }

  if (opts.tools?.length) {
    body.tools = opts.tools
  }

  if (!config.customizeApiParams) {
    return body
  }

  const maxOutput = opts.maxTokensOverride ?? normalizeModelOutputTokens(config.maxOutputTokens)
  body.max_tokens = maxOutput
  body.temperature = config.temperature
  body.top_p = config.topP

  if (config.topK > 0) body.top_k = config.topK
  if (config.minP > 0) body.min_p = config.minP
  if (config.repetitionPenalty !== 1) body.repetition_penalty = config.repetitionPenalty
  if (opts.stopSequences?.length) body.stop = opts.stopSequences

  return body
}

/** Client-side trim budget for assistant reply — not necessarily sent as max_tokens. */
export function resolveOutputReserveTokens(config: ApiModelConfig, override?: number): number {
  if (override != null && Number.isFinite(override)) {
    return normalizeModelOutputTokens(override)
  }
  if (config.customizeApiParams) {
    return normalizeModelOutputTokens(config.maxOutputTokens)
  }
  return MODEL_OUTPUT_RESERVE_DEFAULT
}
