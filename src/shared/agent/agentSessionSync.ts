import type { AgentChatMessage } from './agentChatMessages'
import type { ChatMessage } from '../types'
import { hasAgentBootstrap } from './agentSessionBootstrap'

export { hasAgentBootstrap } from './agentSessionBootstrap'

function agentMessageText(content: AgentChatMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

export function extractUserQueryFromTurnMessage(content: AgentChatMessage['content']): string | null {
  const text = agentMessageText(content)
  const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i)
  return match?.[1]?.trim() ?? null
}

function queriesRoughlyMatch(agentQuery: string, uiText: string): boolean {
  const a = agentQuery.trim()
  const b = uiText.trim()
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  return false
}

/** Trim persisted agent API history to match visible chat messages (rollback / edit). */
export function trimAgentMessagesToChat(
  agentMessages: AgentChatMessage[] | undefined,
  chatMessages: ChatMessage[]
): AgentChatMessage[] | undefined {
  if (!agentMessages?.length || !hasAgentBootstrap(agentMessages)) return agentMessages

  const ui = chatMessages.filter((m) => !m.isStreaming)
  const uiUsers = ui.filter((m) => m.role === 'user').map((m) => m.content.trim())

  if (uiUsers.length === 0) {
    return agentMessages.slice(0, 2)
  }

  let matchedUsers = 0
  let cutEnd = agentMessages.length

  for (let i = 0; i < agentMessages.length; i++) {
    if (i <= 1) continue
    const msg = agentMessages[i]
    if (msg.role !== 'user') continue

    const query = extractUserQueryFromTurnMessage(msg.content)
    if (!query) continue

    if (matchedUsers >= uiUsers.length) {
      cutEnd = i
      break
    }

    if (queriesRoughlyMatch(query, uiUsers[matchedUsers]!)) {
      matchedUsers++
      if (matchedUsers === uiUsers.length && ui[ui.length - 1]?.role === 'user') {
        cutEnd = i
      }
    }
  }

  if (matchedUsers === uiUsers.length && ui[ui.length - 1]?.role === 'assistant') {
    cutEnd = agentMessages.length
  }

  return agentMessages.slice(0, cutEnd)
}
