import { stripAgentInternalBlocks } from './toolResults'

const THINK_OPEN = '\u003cthink\u003e'
const THINK_CLOSE = '\u003c/think\u003e'

const THINKING_TAGS = [
  { open: '<think>', close: '</think>' },
  { open: THINK_OPEN, close: THINK_CLOSE },
  { open: '<thinking>', close: '</thinking>' },
] as const

/** One reasoning block per orchestrator step (prefer tagged thinking). */
export function extractPrimaryThinking(text: string): string | null {
  for (const { open, close } of THINKING_TAGS) {
    const re = new RegExp(`${escapeRe(open)}([\\s\\S]*?)${escapeRe(close)}`, 'i')
    const match = text.match(re)
    if (match?.[1]?.trim()) return match[1].trim()
  }

  return null
}

/** Extract completed thinking blocks from assistant output. */
export function extractThinkingBlocks(text: string): string[] {
  const primary = extractPrimaryThinking(text)
  return primary ? [primary] : []
}

/** Live preview while the model is still reasoning in the current step. */
export function extractStreamActivity(text: string): string | null {
  for (const { open, close } of THINKING_TAGS) {
    const openIdx = text.lastIndexOf(open)
    if (openIdx === -1) continue
    const afterOpen = openIdx + open.length
    const closeIdx = text.indexOf(close, afterOpen)
    if (closeIdx === -1) {
      const partial = text.slice(afterOpen).trim()
      if (partial) return partial
    }
  }

  return null
}

/** User-visible reply text streaming after thinking closed (not a tool step). */
export function extractStreamReply(text: string): string {
  if (looksLikeAgentStepBuffer(text)) return ''
  return stripAgentStreamForDisplay(text)
}

/** True when buffer has an unclosed thinking block (reasoning still streaming). */
export function hasOpenThinkingBlock(text: string): boolean {
  for (const { open, close } of THINKING_TAGS) {
    const openIdx = text.lastIndexOf(open)
    if (openIdx === -1) continue
    const afterOpen = openIdx + open.length
    if (text.indexOf(close, afterOpen) === -1) return true
  }
  return false
}

/** @deprecated use extractStreamActivity */
export function extractInProgressThinking(text: string): string | null {
  return extractStreamActivity(text)
}

/** True while the stream is still an in-progress agent step (tools/thinking), not final reply text. */
export function looksLikeAgentStepBuffer(text: string): boolean {
  if (!text) return false
  if (text.includes('<tool_call>')) return true
  if (/<function=[A-Za-z]/.test(text)) return true
  if (text.includes('<parameter=')) return true

  for (const { open, close } of THINKING_TAGS) {
    const openIdx = text.lastIndexOf(open)
    if (openIdx === -1) continue
    const afterOpen = openIdx + open.length
    if (text.indexOf(close, afterOpen) === -1) return true
  }

  if (/<(?:tool_call|redacted_thinking|think|thinking|function|parameter)[^>]*$/i.test(text)) {
    return true
  }

  return false
}

/** Strip agent-only markup for visible chat text (handles partial stream). */
export function stripAgentStreamForDisplay(text: string): string {
  let out = stripAgentInternalBlocks(text)
  out = stripThinkingTags(out)
  out = out.replace(/<tool_call>[\s\S]*$/g, '')
  out = out.replace(/<(?:tool_call|function|parameter)[^>]*$/i, '')
  return out.trim()
}

function stripThinkingTags(text: string): string {
  let out = text
  for (const { open, close } of THINKING_TAGS) {
    out = out.replace(new RegExp(`${escapeRe(open)}[\\s\\S]*?${escapeRe(close)}`, 'gi'), '')
    out = out.replace(new RegExp(`${escapeRe(open)}[\\s\\S]*$`, 'i'), '')
  }
  return out
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
