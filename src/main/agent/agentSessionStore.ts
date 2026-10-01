import type { AgentChatMessage } from '../../shared/agent/agentChatMessages'
import { isBootstrapUserMessage } from '../../shared/agent/modeReminders'

const sessions = new Map<string, AgentChatMessage[]>()

export function getAgentSessionMessages(sessionId: string): AgentChatMessage[] | null {
  const messages = sessions.get(sessionId)
  return messages ? [...messages] : null
}

export function setAgentSessionMessages(sessionId: string, messages: AgentChatMessage[]): void {
  sessions.set(sessionId, [...messages])
}

export function clearAgentSession(sessionId: string): void {
  sessions.delete(sessionId)
}

/** True when history already has system + bootstrap user messages. */
export function hasAgentBootstrap(messages: AgentChatMessage[]): boolean {
  if (messages.length < 2) return false
  if (messages[0]?.role !== 'system') return false
  const bootstrap = messages[1]
  return bootstrap?.role === 'user' && isBootstrapUserMessage(bootstrap.content)
}
