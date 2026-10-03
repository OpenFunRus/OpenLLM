import type { AgentChatMessage, AgentContentPart } from './agentChatMessages'
import { hasAgentBootstrap } from './agentSessionBootstrap'
import { extractUserQueryFromTurnMessage } from './agentSessionSync'

const SUMMARY_TAG = '<conversation_summary>'
const TOOL_TRUNCATE_CHARS = 2000

function agentMessageText(content: AgentChatMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} chars for summary input]`
}

export function isConversationSummaryMessage(msg: AgentChatMessage): boolean {
  if (msg.role !== 'user') return false
  return agentMessageText(msg.content).includes(SUMMARY_TAG)
}

export function pinnedHeadLength(messages: AgentChatMessage[]): number {
  if (messages.length === 0) return 0
  if (hasAgentBootstrap(messages)) return 2
  if (messages[0]?.role === 'system') return 1
  return 0
}

function isTurnStartMessage(msg: AgentChatMessage, index: number): boolean {
  if (msg.role !== 'user' || index <= 1) return false
  const text = agentMessageText(msg.content)
  if (text.includes(SUMMARY_TAG)) return true
  return extractUserQueryFromTurnMessage(msg.content) !== null
}

/** Each assistant message in the agent loop starts a compressible segment. */
export function findAssistantStepStarts(messages: AgentChatMessage[], afterIndex: number): number[] {
  const starts: number[] = []
  for (let i = afterIndex; i < messages.length; i++) {
    if (messages[i]?.role === 'assistant') starts.push(i)
  }
  return starts
}

export function splitAgentHistoryForSummary(
  messages: AgentChatMessage[],
  keepRecentTurns: number
): { head: AgentChatMessage[]; middle: AgentChatMessage[]; tail: AgentChatMessage[] } {
  const headLen = pinnedHeadLength(messages)
  const head = messages.slice(0, headLen)
  const rest = messages.slice(headLen)

  const turnStarts: number[] = []
  for (let i = headLen; i < messages.length; i++) {
    if (isTurnStartMessage(messages[i]!, i)) turnStarts.push(i)
  }

  const stepStarts = findAssistantStepStarts(messages, headLen)

  // Multi-turn chat: split on user turns. Long single-turn agent run: split on agent steps.
  const segmentStarts =
    turnStarts.length > 1 ? turnStarts : stepStarts.length > 0 ? stepStarts : turnStarts

  if (segmentStarts.length === 0 || keepRecentTurns <= 0) {
    return { head, middle: rest, tail: [] }
  }

  const keep = Math.min(keepRecentTurns, segmentStarts.length)
  const tailStart = segmentStarts[segmentStarts.length - keep]!

  if (tailStart <= headLen) {
    return { head, middle: [], tail: rest }
  }

  return {
    head,
    middle: messages.slice(headLen, tailStart),
    tail: messages.slice(tailStart),
  }
}

/** Best-effort prompt size: API usage from last step may omit tool results appended since. */
export function resolveAgentPromptTokens(
  messages: AgentChatMessage[],
  promptTokens?: number
): number {
  return Math.max(promptTokens ?? 0, estimateAgentMessagesTokens(messages))
}

export function squeezeToolOutputsForSummary(messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.map((msg) => {
    if (msg.role === 'tool') {
      const text = msg.content.map((p) => p.text).join('')
      return {
        ...msg,
        content: [{ type: 'text', text: truncateText(text, TOOL_TRUNCATE_CHARS) }],
      }
    }
    if (msg.role === 'assistant') {
      let content = msg.content
      if (typeof content === 'string') {
        content = content.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '').trim() || null
      }
      const next = { ...msg, content }
      if (msg.tool_calls?.length) {
        return {
          ...next,
          tool_calls: msg.tool_calls.map((call) => ({
            ...call,
            function: {
              ...call.function,
              arguments: truncateText(call.function.arguments, 500),
            },
          })),
        }
      }
      return next
    }
    if (msg.role === 'user') {
      const raw = msg.content
      if (typeof raw === 'string') {
        const stripped = raw
          .replace(/<open_and_recently_viewed_files>[\s\S]*?<\/open_and_recently_viewed_files>\s*/gi, '')
          .replace(/<system_reminder>[\s\S]*?<\/system_reminder>\s*/gi, '')
        return { ...msg, content: truncateText(stripped, TOOL_TRUNCATE_CHARS * 2) }
      }
      const parts: AgentContentPart[] = raw.map((part) => {
        if (part.type !== 'text') return part
        const stripped = part.text
          .replace(/<open_and_recently_viewed_files>[\s\S]*?<\/open_and_recently_viewed_files>\s*/gi, '')
          .replace(/<system_reminder>[\s\S]*?<\/system_reminder>\s*/gi, '')
        return { type: 'text', text: truncateText(stripped, TOOL_TRUNCATE_CHARS * 2) }
      })
      return { ...msg, content: parts }
    }
    return msg
  })
}

function serializeOneMessage(msg: AgentChatMessage): string {
  switch (msg.role) {
    case 'system':
      return `[SYSTEM]\n${msg.content}\n`
    case 'user':
      return `[USER]\n${agentMessageText(msg.content)}\n`
    case 'assistant': {
      const parts: string[] = ['[ASSISTANT]']
      const text = msg.content?.trim()
      if (text) parts.push(text)
      if (msg.tool_calls?.length) {
        for (const call of msg.tool_calls) {
          parts.push(`[tool_call ${call.function.name}] ${call.function.arguments}`)
        }
      }
      return `${parts.join('\n')}\n`
    }
    case 'tool':
      return `[TOOL ${msg.name}]\n${msg.content.map((p) => p.text).join('')}\n`
    default:
      return ''
  }
}

export function serializeAgentSegmentForSummary(messages: AgentChatMessage[]): string {
  return messages.map(serializeOneMessage).join('\n---\n')
}

export function buildSummaryInjectionMessage(summaryMarkdown: string): AgentChatMessage {
  const body = `<system_notification>
Earlier conversation was automatically compressed to free context window space.
The chat UI still shows the full history; rely on the summary below for prior work.
</system_notification>

<conversation_summary>
${summaryMarkdown.trim()}
</conversation_summary>`

  return { role: 'user', content: body }
}

export function mergeHistoryAfterSummary(
  head: AgentChatMessage[],
  summaryMessage: AgentChatMessage,
  tail: AgentChatMessage[]
): AgentChatMessage[] {
  return [...head, summaryMessage, ...tail]
}

export function estimateAgentMessageTokens(msg: AgentChatMessage): number {
  if (msg.role === 'system') return Math.ceil(msg.content.length / 4)
  if (msg.role === 'user') {
    const text = agentMessageText(msg.content)
    return Math.ceil(text.length / 4)
  }
  if (msg.role === 'assistant') {
    let n = msg.content ? Math.ceil(String(msg.content).length / 4) : 0
    if (msg.tool_calls?.length) n += Math.ceil(JSON.stringify(msg.tool_calls).length / 4)
    return n
  }
  if (msg.role === 'tool') {
    const text = msg.content.map((p) => p.text).join('')
    return Math.ceil(text.length / 4)
  }
  return 0
}

export function estimateAgentMessagesTokens(messages: AgentChatMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateAgentMessageTokens(msg), 0)
}

export function stripConversationSummaryMessages(
  messages: AgentChatMessage[] | undefined
): AgentChatMessage[] | undefined {
  if (!messages?.length) return messages
  const filtered = messages.filter((msg) => !isConversationSummaryMessage(msg))
  return filtered.length === messages.length ? messages : filtered
}
