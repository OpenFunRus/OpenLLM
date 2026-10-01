import { stripUtf8Bom } from '../../sanitizeFileContent'
import type { ParsedToolCall } from '../types'
import { TOOL_CALL_CLOSE_TAG, TOOL_CALL_OPEN_TAG } from '../toolCallFormat'

/**
 * Parse Cursor XML tool calls from assistant text.
 * Format is fixed — see docs/cursor/cursor_agent.txt and toolCallFormat.ts.
 */
export function parseToolCalls(text: string): ParsedToolCall[] {
  const results: ParsedToolCall[] = []
  let searchFrom = 0

  while (searchFrom < text.length) {
    const openIdx = text.indexOf(TOOL_CALL_OPEN_TAG, searchFrom)
    if (openIdx === -1) break

    const closeIdx = text.indexOf(TOOL_CALL_CLOSE_TAG, openIdx)
    if (closeIdx === -1) break

    const inner = text.slice(openIdx + TOOL_CALL_OPEN_TAG.length, closeIdx).trim()
    const parsed = parseSingleToolCall(inner)
    if (parsed) results.push(parsed)

    searchFrom = closeIdx + TOOL_CALL_CLOSE_TAG.length
  }

  return results
}

function parseSingleToolCall(inner: string): ParsedToolCall | null {
  const fnOpen = inner.match(/^<function=([^>\s]+)>\s*/m)
  if (!fnOpen || fnOpen.index !== 0) return null

  const name = fnOpen[1]
  const afterFnOpen = inner.slice(fnOpen[0].length)
  const fnCloseIdx = afterFnOpen.lastIndexOf('</function>')
  if (fnCloseIdx === -1) return null

  const paramBody = afterFnOpen.slice(0, fnCloseIdx)
  const argumentsMap = parseParameters(paramBody)
  return { name, arguments: argumentsMap }
}

/**
 * Sequential parameter parser — avoids false `<parameter=` matches inside file contents.
 */
function parseParameters(body: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  let i = 0

  while (i < body.length) {
    const slice = body.slice(i)
    const ws = slice.match(/^\s+/)
    if (ws) {
      i += ws[0].length
      continue
    }

    const openMatch = slice.match(/^<parameter=([^>\s]+)>\n?/)
    if (!openMatch) break

    const paramName = normalizeParamName(openMatch[1])
    const valueStart = i + openMatch[0].length
    const fnCloseIdx = body.indexOf('</function>', valueStart)
    const nextParamIdx = findNextParameterTag(body, valueStart)

    let valueEnd: number
    if (nextParamIdx !== -1 && (fnCloseIdx === -1 || nextParamIdx < fnCloseIdx)) {
      valueEnd = nextParamIdx
    } else {
      valueEnd = fnCloseIdx !== -1 ? fnCloseIdx : body.length
    }

    let raw = body.slice(valueStart, valueEnd)
    const closeTag = '</parameter>'
    const closeIdx = raw.lastIndexOf(closeTag)
    if (closeIdx !== -1 && raw.slice(closeIdx + closeTag.length).trim() === '') {
      raw = raw.slice(0, closeIdx)
    }
    if (raw.endsWith('\n')) raw = raw.slice(0, -1)

    args[paramName] = coerceParameterValue(paramName, stripUtf8Bom(raw))
    i = valueEnd
  }

  return args
}

/** Next `<parameter=` that starts on its own line (real param boundary, not file content). */
function findNextParameterTag(body: string, from: number): number {
  const re = /\n<parameter=([^>\s]+)>/g
  re.lastIndex = from
  const match = re.exec(body)
  return match ? match.index + 1 : -1
}

function normalizeParamName(name: string): string {
  if (name === 'content') return 'contents'
  return name
}

/** Best-effort JSON/boolean/number coercion for common tool args. */
function coerceParameterValue(name: string, raw: string): unknown {
  if (name === 'contents' || name === 'old_string' || name === 'new_string' || name === 'command') {
    return raw
  }

  const trimmed = raw.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return raw
    }
  }
  return raw
}

export function hasCompleteToolCall(text: string): boolean {
  return text.includes(TOOL_CALL_OPEN_TAG) && text.includes(TOOL_CALL_CLOSE_TAG)
}
