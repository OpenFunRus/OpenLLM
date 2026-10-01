import fs from 'fs/promises'
import path from 'path'
import { stripUtf8Bom } from '../../../shared/sanitizeFileContent'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPathOrError } from '../AgentToolContext'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

export async function executeRead(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const pathArg = String(args.path ?? '')
  if (!pathArg.trim()) return 'Error: path is required'
  let filePath: string
  try {
    filePath = resolveAgentPathOrError(ctx, pathArg)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }

  try {
    await fs.access(filePath)
  } catch {
    return `Error: File not found: ${filePath}`
  }

  const ext = path.extname(filePath).toLowerCase()
  if (IMAGE_EXTS.has(ext)) {
    const buf = await fs.readFile(filePath)
    return `[Image file ${path.basename(filePath)}, ${buf.length} bytes, ${ext.slice(1)} — vision passthrough not yet wired in agent loop]`
  }

  const content = stripUtf8Bom(await fs.readFile(filePath, 'utf-8'))
  if (content.length === 0) return 'File is empty.'

  const lines = content.split(/\r?\n/)
  const offset = args.offset !== undefined ? Number(args.offset) : undefined
  const limit = args.limit !== undefined ? Number(args.limit) : undefined

  let startIdx = 0
  let endIdx = lines.length

  if (offset !== undefined && !Number.isNaN(offset)) {
    if (offset > 0) {
      startIdx = offset - 1
    } else if (offset < 0) {
      startIdx = Math.max(0, lines.length + offset)
    }
  }

  if (limit !== undefined && !Number.isNaN(limit) && limit >= 0) {
    endIdx = Math.min(lines.length, startIdx + limit)
  }

  startIdx = Math.max(0, Math.min(startIdx, lines.length))
  const slice = lines.slice(startIdx, endIdx)

  return slice.map((line, i) => `${String(startIdx + i + 1).padStart(6, ' ')}|${line}`).join('\n')
}
