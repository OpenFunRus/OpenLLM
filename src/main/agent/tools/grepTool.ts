import { spawn } from 'child_process'
import { rgPath } from '@vscode/ripgrep'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPathOrError } from '../AgentToolContext'

const MAX_OUTPUT_LINES = 5000

export async function executeGrep(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const pattern = String(args.pattern ?? '')
  if (!pattern) return 'Error: pattern is required'

  const outputMode = (args.output_mode as string) ?? 'content'
  let searchPath: string
  if (args.path) {
    try {
      searchPath = resolveAgentPathOrError(ctx, String(args.path))
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`
    }
  } else if (ctx.workspaceRoot) {
    searchPath = ctx.workspaceRoot
  } else {
    return 'Error: No workspace folder open — open a project folder first'
  }

  const rgArgs: string[] = []

  if (outputMode === 'files_with_matches') rgArgs.push('--files-with-matches')
  else if (outputMode === 'count') rgArgs.push('--count-matches')
  else rgArgs.push('--line-number')

  if (args['-i'] === true) rgArgs.push('-i')
  if (args.multiline === true) rgArgs.push('-U', '--multiline-dotall')

  const ctxLines = args['-C'] as number | undefined
  const before = args['-B'] as number | undefined
  const after = args['-A'] as number | undefined
  if (ctxLines !== undefined) rgArgs.push('-C', String(ctxLines))
  else {
    if (before !== undefined) rgArgs.push('-B', String(before))
    if (after !== undefined) rgArgs.push('-A', String(after))
  }

  if (args.glob) rgArgs.push('--glob', String(args.glob))
  if (args.type) rgArgs.push('--type', String(args.type))

  rgArgs.push('--max-count', String(MAX_OUTPUT_LINES))
  rgArgs.push(pattern)
  rgArgs.push(searchPath)

  const output = await runRipgrep(rgArgs)
  if (!output.trim()) return 'No matches found'
  return output
}

function runRipgrep(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(rgPath, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString() })
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString() })

    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0 || code === 1) {
        resolve(stdout || stderr)
      } else {
        reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`))
      }
    })
  })
}
