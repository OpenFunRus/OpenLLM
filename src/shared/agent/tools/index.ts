import type { AgentMode, CursorToolFunctionSchema, ToolPriority, ToolRegistryEntry } from '../types'
import {
  CURSOR_AGENT_TOOL_NAMES,
  CURSOR_AGENT_TOOL_SCHEMAS,
  type CursorAgentToolName
} from './cursorAgentSchemas'
import { CURSOR_PLAN_TOOL_SCHEMAS } from './cursorPlanSchemas'
import { CURSOR_ASK_TOOL_SCHEMAS } from './cursorAskSchemas'

export { CURSOR_AGENT_TOOL_NAMES, CURSOR_AGENT_TOOL_SCHEMAS, type CursorAgentToolName }

/** P0 tools — first full implementation target. */
export const P0_TOOL_NAMES = [
  'Read',
  'Write',
  'StrReplace',
  'Delete',
  'Glob',
  'Grep',
  'Shell'
] as const satisfies readonly CursorAgentToolName[]

export type P0ToolName = (typeof P0_TOOL_NAMES)[number]

const SCHEMAS_BY_MODE: Record<AgentMode, readonly CursorToolFunctionSchema[]> = {
  agent: CURSOR_AGENT_TOOL_SCHEMAS,
  plan: CURSOR_PLAN_TOOL_SCHEMAS,
  ask: CURSOR_ASK_TOOL_SCHEMAS
}

/** P0 file tools implemented in ToolExecutor (Stage 2–3). */
const IMPLEMENTED_TOOLS = new Set<string>([
  'Read', 'Write', 'StrReplace', 'Delete', 'Glob', 'Grep', 'Shell',
  'TodoWrite', 'AskQuestion', 'CreatePlan', 'ReadLints', 'SwitchMode',
  'WebSearch', 'WebFetch', 'GetDynamicTools', 'CallDynamicTool', 'FetchMcpResource',
  'AwaitShell', 'EditNotebook', 'Task',
])

const TOOL_PRIORITY: Record<string, ToolPriority> = {
  Read: 'P0',
  Write: 'P0',
  StrReplace: 'P0',
  Delete: 'P0',
  Glob: 'P0',
  Grep: 'P0',
  Shell: 'P0',
  AwaitShell: 'P1',
  ReadLints: 'P1',
  TodoWrite: 'P1',
  AskQuestion: 'P2',
  WebSearch: 'P2',
  WebFetch: 'P2',
  SwitchMode: 'P2',
  CreatePlan: 'P2',
  EditNotebook: 'P3',
  Task: 'P3',
  GetDynamicTools: 'P3',
  CallDynamicTool: 'P3',
  FetchMcpResource: 'P3'
}

function buildRegistry(mode: AgentMode = 'agent'): ToolRegistryEntry[] {
  return SCHEMAS_BY_MODE[mode].map((schema) => ({
    schema,
    priority: TOOL_PRIORITY[schema.function.name] ?? 'P3',
    implemented: IMPLEMENTED_TOOLS.has(schema.function.name)
  }))
}

export const TOOL_REGISTRY = buildRegistry('agent')

export function getToolSchema(
  name: string,
  mode: AgentMode = 'agent'
): CursorToolFunctionSchema | undefined {
  return SCHEMAS_BY_MODE[mode].find((s) => s.function.name === name)
}

export function getToolSchemas(mode: AgentMode = 'agent'): CursorToolFunctionSchema[] {
  return [...SCHEMAS_BY_MODE[mode]]
}

export function formatToolsPromptBlock(schemas: readonly CursorToolFunctionSchema[]): string {
  const body = schemas.map((s) => JSON.stringify(s)).join('\n')
  return `<tools>\n${body}\n</tools>`
}

export function formatToolsSection(mode: AgentMode = 'agent'): string {
  const schemas = getToolSchemas(mode)
  return `# Tools\n\nYou have access to the following functions:\n\n${formatToolsPromptBlock(schemas)}`
}

export function isP0Tool(name: string): name is P0ToolName {
  return (P0_TOOL_NAMES as readonly string[]).includes(name)
}

export function isToolImplemented(name: string): boolean {
  return IMPLEMENTED_TOOLS.has(name)
}

export function markToolImplemented(name: string): void {
  IMPLEMENTED_TOOLS.add(name)
}
