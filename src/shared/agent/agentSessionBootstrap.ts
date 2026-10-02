import type { AgentChatMessage } from './agentChatMessages'
import { isBootstrapUserMessage } from './modeReminders'

/** True when history already has system + bootstrap user messages. */
export function hasAgentBootstrap(messages: AgentChatMessage[]): boolean {
  if (messages.length < 2) return false
  if (messages[0]?.role !== 'system') return false
  const bootstrap = messages[1]
  return bootstrap?.role === 'user' && isBootstrapUserMessage(bootstrap.content)
}
