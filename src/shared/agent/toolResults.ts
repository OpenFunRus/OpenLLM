import type { AgentChatMessage } from './agentChatMessages'
import type { ToolResult } from './types'

/** Native OpenAI tool result messages (one per tool). */
export function toolResultsToNativeMessages(results: ToolResult[]): AgentChatMessage[] {
  return results.map((r) => ({
    role: 'tool' as const,
    tool_call_id: r.toolCallId ?? '',
    name: r.name,
    content: [{ type: 'text' as const, text: r.content }],
  }))
}

/** Format tool results for the next LLM turn (legacy XML). */
export function formatToolResultsForModel(results: ToolResult[]): string {
  return results
    .map(
      (r) =>
        `<tool_result>\n<function=${r.name}>\n${r.content}\n</function>\n</tool_result>`
    )
    .join('\n')
}

/** Strip thinking + tool_call blocks for user-visible final text. */
export function stripAgentInternalBlocks(text: string): string {
  let out = text
  out = out.replace(/<think>[\s\S]*?<\/redacted_thinking>\s*/g, '')
  out = out.replace(/\u003cthink\u003e[\s\S]*?\u003c\/think\u003e\s*/gi, '')
  out = out.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
  out = out.replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/g, '')
  return out.trim()
}
