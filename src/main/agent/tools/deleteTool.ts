import fs from 'fs/promises'
import type { ToolDispatchResult } from '../../../shared/agent/toolDispatch'
import { fileService } from '../../services/FileService'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPathOrError } from '../AgentToolContext'

export async function executeDelete(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<ToolDispatchResult> {
  const pathArg = String(args.path ?? '')
  if (!pathArg.trim()) return 'Error: path is required'
  let filePath: string
  try {
    filePath = resolveAgentPathOrError(ctx, pathArg)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }

  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      return 'Error: Delete tool only supports files, not directories'
    }
  } catch {
    return `Error: File not found: ${filePath}`
  }

  let oldContent = ''
  try {
    oldContent = await fileService.readFile(filePath)
  } catch {
    oldContent = ''
  }

  await fileService.delete(filePath)
  return {
    content: `Deleted ${filePath}`,
    filePath,
    oldContent,
    newContent: '',
  }
}
