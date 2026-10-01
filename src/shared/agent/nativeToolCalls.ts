import type { ParsedToolCall } from './types'

export type NativeToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type ToolCallDelta = {
  index?: number
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

type StreamDelta = {
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: ToolCallDelta[]
}

export type StreamCompletionState = {
  content: string
  reasoningContent: string
  toolCallAcc: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  finishReason: string | null
}

export function createStreamCompletionState(): StreamCompletionState {
  return {
    content: '',
    reasoningContent: '',
    toolCallAcc: [],
    finishReason: null,
  }
}

export function applyStreamDelta(state: StreamCompletionState, delta: StreamDelta | undefined): void {
  if (!delta) return
  if (delta.content) state.content += delta.content
  if (delta.reasoning_content) state.reasoningContent += delta.reasoning_content
  if (delta.tool_calls?.length) mergeToolCallDeltas(state.toolCallAcc, delta.tool_calls)
}

export function applyStreamFinishReason(state: StreamCompletionState, finishReason: string | null | undefined): void {
  if (finishReason) state.finishReason = finishReason
}

function mergeToolCallDeltas(
  accum: StreamCompletionState['toolCallAcc'],
  deltas: ToolCallDelta[]
): void {
  for (const d of deltas) {
    const idx = d.index ?? accum.length
    while (accum.length <= idx) {
      accum.push({ id: '', type: 'function', function: { name: '', arguments: '' } })
    }
    const slot = accum[idx]
    if (d.id) slot.id = d.id
    if (d.type === 'function') slot.type = 'function'
    if (d.function?.name) slot.function.name += d.function.name
    if (d.function?.arguments) slot.function.arguments += d.function.arguments
  }
}

export function finalizeNativeToolCalls(state: StreamCompletionState): NativeToolCall[] {
  return state.toolCallAcc
    .filter((tc) => tc.id && tc.function.name)
    .map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments || '{}',
      },
    }))
}

export function nativeToolCallsToParsed(calls: NativeToolCall[]): ParsedToolCall[] {
  return calls.map((tc) => {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(tc.function.arguments) as Record<string, unknown>
    } catch {
      args = {}
    }
    return { name: tc.function.name, arguments: args, toolCallId: tc.id }
  })
}
