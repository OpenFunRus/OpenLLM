import type { ToolDispatchResult } from '../../../shared/agent/toolDispatch'
import { stripUtf8Bom } from '../../../shared/sanitizeFileContent'
import { fileService } from '../../services/FileService'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPathOrError } from '../AgentToolContext'

export async function executeWrite(
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
  const contents = typeof args.contents === 'string' ? args.contents : ''

  const newContent = stripUtf8Bom(contents)
  let oldContent = ''
  try {
    oldContent = await fileService.readFile(filePath)
  } catch {
    oldContent = ''
  }

  await fileService.writeFile(filePath, newContent)
  return {
    content: `Wrote ${newContent.length} bytes to ${filePath}`,
    filePath,
    oldContent,
    newContent,
  }
}
