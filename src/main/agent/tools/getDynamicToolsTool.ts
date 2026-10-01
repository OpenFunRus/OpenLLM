import type { AgentToolContext } from '../AgentToolContext'
import { mcpRegistry } from '../../services/mcpRegistry'

function truncateDescription(text: string, max = 200): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}... [truncated]`
}

function matchesPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, 'i').test(value)
  } catch {
    return false
  }
}

export async function executeGetDynamicTools(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const namespace = typeof args.namespace === 'string' ? args.namespace : undefined
  const toolName = typeof args.toolName === 'string' ? args.toolName : undefined
  const pattern = typeof args.pattern === 'string' ? args.pattern.slice(0, 256) : undefined

  const catalog = await mcpRegistry.getCatalog(ctx.workspaceRoot)

  let tools = catalog.tools
  if (namespace) tools = tools.filter((entry) => entry.namespace === namespace)
  if (toolName) tools = tools.filter((entry) => entry.toolName === toolName)
  if (pattern) {
    tools = tools.filter(
      (entry) =>
        matchesPattern(entry.namespace, pattern) || matchesPattern(entry.toolName, pattern)
    )
  }

  const payload = {
    namespaces: namespace
      ? catalog.namespaces.filter((ns) => ns.name === namespace)
      : catalog.namespaces,
    tools: tools.map((entry) => ({
      ...entry,
      description:
        pattern && !toolName ? truncateDescription(entry.description) : entry.description,
      inputSchema: toolName ? entry.inputSchema : undefined,
    })),
    mcpServersConfigured: catalog.mcpServersConfigured,
    configPaths: mcpRegistry.getConfigPaths(ctx.workspaceRoot),
  }

  return JSON.stringify(payload, null, 2)
}
