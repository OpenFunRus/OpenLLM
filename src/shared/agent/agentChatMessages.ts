import type { CursorToolFunctionSchema } from './types'
import type { NativeToolCall } from './nativeToolCalls'

export type AgentTextPart = { type: 'text'; text: string }
export type AgentImagePart = { type: 'image_url'; image_url: { url: string } }
export type AgentContentPart = AgentTextPart | AgentImagePart

export type AgentChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | AgentContentPart[] }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: NativeToolCall[]
    }
  | {
      role: 'tool'
      tool_call_id: string
      name: string
      content: AgentTextPart[]
    }

export type AgentStreamResult = {
  content: string
  reasoningContent: string
  toolCalls: NativeToolCall[]
  finishReason: string | null
  assistantMessage: Extract<AgentChatMessage, { role: 'assistant' }>
}

export function isNativeToolsEnabled(): boolean {
  return process.env.OPENLLM_AGENT_LEGACY_XML !== '1'
}

export function openAiToolsFromSchemas(schemas: readonly CursorToolFunctionSchema[]): CursorToolFunctionSchema[] {
  return [...schemas]
}
