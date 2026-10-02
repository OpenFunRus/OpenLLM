import type { AgentMode } from './types'
import { isNativeToolsEnabled } from './agentChatMessages'
import { CURSOR_TOOL_CALL_INSTRUCTIONS } from './toolCallFormat'
import { formatToolsSection } from './tools'
import { AGENT_SECTIONS, AGENT_NATIVE_SECTIONS } from './prompts/agentSystemBody'
import { ASK_NATIVE_SECTIONS } from './prompts/askSystemBody'
import { PLAN_NATIVE_SECTIONS } from './prompts/planSystemBody'

function nativeSectionsForMode(mode: AgentMode): readonly string[] {
  switch (mode) {
    case 'chat':
      return ASK_NATIVE_SECTIONS
    case 'plan':
      return PLAN_NATIVE_SECTIONS
    default:
      return AGENT_NATIVE_SECTIONS
  }
}

/** Build agent system prompt. Native mode: body only (tools in API `tools` field). */
export function buildAgentSystemPrompt(mode: AgentMode = 'agent'): string {
  if (isNativeToolsEnabled()) {
    return nativeSectionsForMode(mode).join('\n\n')
  }
  const parts = [
    formatToolsSection(mode),
    '',
    CURSOR_TOOL_CALL_INSTRUCTIONS,
    '',
    ...AGENT_SECTIONS,
  ]
  return parts.join('\n\n')
}
