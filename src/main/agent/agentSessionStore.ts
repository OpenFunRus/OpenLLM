import type { AgentChatMessage } from '../../shared/agent/agentChatMessages'

export { hasAgentBootstrap } from '../../shared/agent/agentSessionBootstrap'

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

export function clearAllAgentSessions(): void {
  sessions.clear()
}

export function restoreAgentSession(
  sessionId: string,
  messages: AgentChatMessage[] | null | undefined
): void {
  if (!messages?.length) {
    clearAgentSession(sessionId)
    return
  }
  setAgentSessionMessages(sessionId, messages)
}
