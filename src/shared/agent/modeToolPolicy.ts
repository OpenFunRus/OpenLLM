import type { AgentMode } from './types'

/** Tools allowed in Ask mode and Plan mode (read-only exploration). */
const READONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'ReadLints',
  'WebSearch',
  'WebFetch',
  'AskQuestion',
  'GetDynamicTools',
  'CallDynamicTool',
  'FetchMcpResource',
  'TodoWrite',
  'Task',
])

/** Extra tools allowed only in Plan mode (still no arbitrary file edits). */
const PLAN_ONLY_TOOLS = new Set(['CreatePlan', 'SwitchMode'])

export function checkModeToolPolicy(
  mode: AgentMode,
  name: string,
  args: Record<string, unknown>
): string | null {
  if (mode === 'agent') return null

  if (mode === 'plan' && PLAN_ONLY_TOOLS.has(name)) return null

  if (READONLY_TOOLS.has(name)) {
    if (name === 'FetchMcpResource' && args.downloadPath) {
      return `Error: FetchMcpResource with downloadPath is not allowed in ${mode} mode`
    }
    return null
  }

  return `Error: Tool "${name}" is not allowed in ${mode} mode (read-only). Switch to Agent mode to make changes.`
}
