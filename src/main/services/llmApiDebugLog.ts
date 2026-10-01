import fs from 'fs'
import path from 'path'

const REDACT_HEADERS = new Set(['authorization', 'x-api-key', 'api-key'])

/** Opt-in: OPENLLM_LLM_DEBUG=1 включает запись в logs/llm-api. */
export const LLM_API_DEBUG_ENABLED = process.env.OPENLLM_LLM_DEBUG === '1'

function getLogDir(): string {
  try {
    const { app } = require('electron') as {
      app?: { isPackaged: boolean; getPath: (name: string) => string }
    }
    if (app?.isPackaged) {
      return path.join(path.dirname(app.getPath('exe')), 'logs', 'llm-api')
    }
  } catch {
    /* not in electron main */
  }
  return path.join(process.cwd(), 'logs', 'llm-api')
}

function utcStamp(): string {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0')
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}_${ms}${rand}`
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'req'
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key] = REDACT_HEADERS.has(key.toLowerCase()) ? '<redacted>' : value
  }
  return out
}

function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>
  const messages = clone.messages
  if (!Array.isArray(messages)) return clone

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue
    const content = (msg as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      if (p.type !== 'image_url' || !p.image_url || typeof p.image_url !== 'object') continue
      const url = (p.image_url as { url?: string }).url ?? ''
      if (url.startsWith('data:')) {
        ;(p.image_url as { url: string }).url = `<redacted base64 ${url.length} chars>`
      }
    }
  }
  return clone
}

function summarizeMessages(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null
  const messages = (body as Record<string, unknown>).messages
  if (!Array.isArray(messages)) return null

  const roles: Record<string, number> = {}
  let totalChars = 0
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue
    const role = String((msg as Record<string, unknown>).role ?? '?')
    roles[role] = (roles[role] ?? 0) + 1
    const content = (msg as Record<string, unknown>).content
    if (typeof content === 'string') {
      totalChars += content.length
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
          totalChars += String((part as { text?: string }).text ?? '').length
        }
      }
    }
  }
  return { message_count: messages.length, roles, approx_content_chars: totalChars }
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return safeName(url)
  }
}

function writeLog(record: Record<string, unknown>): void {
  if (!LLM_API_DEBUG_ENABLED) return
  try {
    const dir = getLogDir()
    fs.mkdirSync(dir, { recursive: true })
    const id = String(record.id ?? utcStamp())
    const phase = String(record.phase ?? 'log')
    const pathPart = safeName(String(record.path ?? record.label ?? 'unknown'))
    const fname = `${id}_${phase}_${pathPart}.json`
    fs.writeFileSync(path.join(dir, fname), JSON.stringify(record, null, 2), 'utf-8')
  } catch {
    /* ignore logging failures */
  }
}

export function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

export function logLlmRequest(opts: {
  label: string
  url: string
  headers: Record<string, string>
  body: unknown
}): string {
  const id = utcStamp()
  if (!LLM_API_DEBUG_ENABLED) return id

  const bodyObj = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body
  writeLog({
    id,
    phase: 'request',
    ts: new Date().toISOString(),
    label: opts.label,
    method: 'POST',
    path: pathFromUrl(opts.url),
    url: opts.url,
    headers: redactHeaders(opts.headers),
    body: redactBody(bodyObj),
    body_keys: bodyObj && typeof bodyObj === 'object' ? Object.keys(bodyObj as object).sort() : null,
    messages_summary: summarizeMessages(bodyObj),
  })
  return id
}

export function logLlmResponse(opts: {
  id: string
  label: string
  status: number
  headers?: Record<string, string>
  body?: unknown
  error?: string
}): void {
  if (!LLM_API_DEBUG_ENABLED) return
  writeLog({
    id: opts.id,
    phase: 'response',
    ts: new Date().toISOString(),
    label: opts.label,
    status: opts.status,
    headers: opts.headers ?? {},
    body: opts.body,
    error: opts.error,
  })
}

export function logLlmStreamResponse(opts: {
  id: string
  label: string
  status: number
  headers?: Record<string, string>
  streamText: string
  assistantText?: string
  reasoningText?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null
  parsedChunks?: unknown[]
  toolCalls?: unknown[]
  finishReason?: string | null
}): void {
  if (!LLM_API_DEBUG_ENABLED) return
  writeLog({
    id: opts.id,
    phase: 'response_stream',
    ts: new Date().toISOString(),
    label: opts.label,
    status: opts.status,
    headers: opts.headers ?? {},
    stream_chars: opts.streamText.length,
    stream_preview: opts.streamText.slice(0, 20_000),
    assistant_text: opts.assistantText ?? '',
    assistant_text_chars: opts.assistantText?.length ?? 0,
    reasoning_text: opts.reasoningText ?? '',
    reasoning_text_chars: opts.reasoningText?.length ?? 0,
    finish_reason: opts.finishReason ?? null,
    tool_calls: opts.toolCalls ?? undefined,
    usage: opts.usage ?? null,
    parsed_chunks: opts.parsedChunks?.slice(0, 500) ?? undefined,
  })
}

export function getLlmApiLogDir(): string {
  return getLogDir()
}
