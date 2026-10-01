import type { ToolDispatchResult } from '../../../shared/agent/toolDispatch'
import { stripUtf8Bom } from '../../../shared/sanitizeFileContent'
import { fileService } from '../../services/FileService'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPathOrError } from '../AgentToolContext'

export async function executeStrReplace(
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
  const oldString = args.old_string
  const newString = args.new_string
  const replaceAll = args.replace_all === true

  if (!filePath) return 'Error: path is required'
  if (typeof oldString !== 'string') return 'Error: old_string is required'
  if (typeof newString !== 'string') return 'Error: new_string is required'
  const oldText = stripUtf8Bom(oldString)
  const newText = stripUtf8Bom(newString)
  if (oldText === newText) return 'Error: old_string and new_string must differ'

  let content: string
  try {
    content = await fileService.readFile(filePath)
  } catch {
    return `Error: File not found: ${filePath}`
  }
  const oldContent = content

  if (!content.includes(oldText)) {
    return 'Error: old_string not found in file'
  }

  if (!replaceAll) {
    const firstIdx = content.indexOf(oldText)
    const secondIdx = content.indexOf(oldText, firstIdx + oldText.length)
    if (secondIdx !== -1) {
      return 'Error: old_string is not unique in file. Provide more context or set replace_all=true'
    }
    content = content.replace(oldText, newText)
  } else {
    content = content.split(oldText).join(newText)
  }

  await fileService.writeFile(filePath, content)
  return {
    content: `Replaced in ${filePath}`,
    filePath,
    oldContent,
    newContent: content,
  }
}
