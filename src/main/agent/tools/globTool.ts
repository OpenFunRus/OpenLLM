import fs from 'fs/promises'
import path from 'path'
import fg from 'fast-glob'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPathOrError } from '../AgentToolContext'

export async function executeGlob(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const patternRaw = String(args.glob_pattern ?? '')
  if (!patternRaw) return 'Error: glob_pattern is required'

  let pattern = patternRaw
  if (!pattern.startsWith('**/')) {
    pattern = `**/${pattern}`
  }

  let baseDir: string | null
  if (args.target_directory) {
    try {
      baseDir = resolveAgentPathOrError(ctx, String(args.target_directory))
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`
    }
  } else {
    baseDir = ctx.workspaceRoot
  }

  if (!baseDir) return 'Error: No workspace folder open — open a project folder first'

  try {
    const stat = await fs.stat(baseDir)
    if (!stat.isDirectory()) return `Error: Not a directory: ${baseDir}`
  } catch {
    return `Error: Directory not found: ${baseDir}`
  }

  const matches = await fg(pattern, {
    cwd: baseDir,
    absolute: true,
    onlyFiles: true,
    dot: false,
    suppressErrors: true
  })

  const withMtime = await Promise.all(
    matches.map(async (filePath) => {
      try {
        const st = await fs.stat(filePath)
        return { filePath, mtime: st.mtimeMs }
      } catch {
        return { filePath, mtime: 0 }
      }
    })
  )

  withMtime.sort((a, b) => b.mtime - a.mtime)

  if (withMtime.length === 0) return 'No files found'

  return withMtime.map((f) => f.filePath).join('\n')
}
