import type { AgentToolContext } from '../AgentToolContext'
import { mcpRegistry } from '../../services/mcpRegistry'

export async function executeCallDynamicTool(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const namespace = typeof args.namespace === 'string' ? args.namespace : ''
  const toolName = typeof args.toolName === 'string' ? args.toolName : ''
  const toolArgs =
    args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments)
      ? (args.arguments as Record<string, unknown>)
      : {}

  if (!namespace || !toolName) {
    return 'Error: namespace and toolName are required'
  }

  return mcpRegistry.callTool(namespace, toolName, toolArgs, ctx.workspaceRoot)
}
