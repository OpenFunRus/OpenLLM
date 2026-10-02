import type { AgentChatMessage, AgentContentPart } from './agentChatMessages'
import type { AgentMode } from './types'

/** Stale per-turn mode blocks — mode is defined only in the system prompt. */
const MODE_REMINDER_RE = /<system_reminder>[\s\S]*?<\/system_reminder>\s*/gi

function stripModeRemindersFromText(text: string): string {
  return text.replace(MODE_REMINDER_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

function stripModeRemindersFromContent(content: string | AgentContentPart[]): string | AgentContentPart[] {
  if (typeof content === 'string') {
    return stripModeRemindersFromText(content)
  }
  const parts: AgentContentPart[] = []
  for (const part of content) {
    if (part.type !== 'text') {
      parts.push(part)
      continue
    }
    const cleaned = stripModeRemindersFromText(part.text)
    if (cleaned) parts.push({ type: 'text', text: cleaned })
  }
  return parts.length === 1 && parts[0]!.type === 'text' ? parts[0]!.text : parts
}

/** Remove legacy mode reminders from user turns — current mode lives in messages[0] system prompt. */
export function cleanModeRemindersFromHistory(messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.map((msg, index) => {
    if (msg.role !== 'user' || index <= 1) return msg
    return { ...msg, content: stripModeRemindersFromContent(msg.content) }
  })
}

function systemPromptText(content: AgentChatMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

/** Infer agent mode from persisted system prompt (session restore). */
export function inferAgentModeFromMessages(messages: AgentChatMessage[]): AgentMode | undefined {
  const system = messages.find((m) => m.role === 'system')
  if (!system) return undefined
  const text = systemPromptText(system.content)
  if (text.includes('You are in Chat mode') || text.includes('You are in Ask mode')) return 'chat'
  if (text.includes('You are in Plan mode')) return 'plan'
  if (text.includes('You are a coding agent')) return 'agent'
  return undefined
}

export function isBootstrapUserMessage(content: string | AgentContentPart[]): boolean {
  const text = typeof content === 'string' ? content : content.map((p) => ('text' in p ? p.text : '')).join('')
  return text.includes('<user_info>')
}
