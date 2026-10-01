import type { AgentToolEvent } from '@shared/agent/types'

type ReasoningFlush = (messageId: string, token: string) => void
type ToolFlush = (messageId: string, event: AgentToolEvent) => void

const reasoningPending = new Map<string, string>()
const reasoningRaf = new Map<string, number>()

const toolPending = new Map<string, { messageId: string; event: AgentToolEvent }>()
let toolRaf: number | null = null

export function queueReasoningToken(
  messageId: string,
  token: string,
  flush: ReasoningFlush
): void {
  reasoningPending.set(messageId, (reasoningPending.get(messageId) ?? '') + token)
  if (reasoningRaf.has(messageId)) return
  reasoningRaf.set(
    messageId,
    requestAnimationFrame(() => {
      const batch = reasoningPending.get(messageId) ?? ''
      reasoningPending.delete(messageId)
      reasoningRaf.delete(messageId)
      if (batch) flush(messageId, batch)
    })
  )
}

export function flushReasoningTokens(messageId: string, flush: ReasoningFlush): void {
  const raf = reasoningRaf.get(messageId)
  if (raf != null) cancelAnimationFrame(raf)
  reasoningRaf.delete(messageId)
  const batch = reasoningPending.get(messageId) ?? ''
  reasoningPending.delete(messageId)
  if (batch) flush(messageId, batch)
}

export function queueToolEvent(
  messageId: string,
  event: AgentToolEvent,
  flush: ToolFlush,
  immediate = false
): void {
  const key = event.toolId ?? `${event.step}-${event.name}-${event.status ?? 'pending'}`
  toolPending.set(key, { messageId, event })

  if (immediate || event.status === 'done') {
    flushPendingToolEvents(flush)
    return
  }

  if (toolRaf != null) return
  toolRaf = requestAnimationFrame(() => flushPendingToolEvents(flush))
}

export function flushPendingToolEvents(flush: ToolFlush): void {
  if (toolRaf != null) {
    cancelAnimationFrame(toolRaf)
    toolRaf = null
  }
  const batch = [...toolPending.values()]
  toolPending.clear()
  for (const { messageId, event } of batch) {
    flush(messageId, event)
  }
}
