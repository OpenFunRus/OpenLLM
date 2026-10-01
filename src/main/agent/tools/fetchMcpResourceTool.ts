import fs from 'fs/promises'
import path from 'path'
import type { ToolDispatchResult } from '../../../shared/agent/toolDispatch'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPathOrError } from '../AgentToolContext'
import { mcpRegistry } from '../../services/mcpRegistry'

export async function executeFetchMcpResource(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<ToolDispatchResult> {
  const server = String(args.server ?? '').trim()
  const uri = String(args.uri ?? '').trim()
  if (!server) return 'Error: server is required'
  if (!uri) return 'Error: uri is required'

  const downloadPath =
    typeof args.downloadPath === 'string' && args.downloadPath.trim()
      ? args.downloadPath.trim()
      : undefined

  try {
    const { text, mimeType } = await mcpRegistry.fetchResource(server, uri, ctx.workspaceRoot)

    if (downloadPath) {
      const target = resolveAgentPathOrError(ctx, downloadPath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, text, 'utf-8')
      return {
        content: `Resource saved to ${target}${mimeType ? ` (${mimeType})` : ''}`,
        filePath: target,
      }
    }

    return text
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
