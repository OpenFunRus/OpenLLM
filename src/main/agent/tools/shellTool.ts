import type { ToolDispatchResult } from '../../../shared/agent/toolDispatch'
import { detectMkdirPath } from '../../../shared/agent/shellMkdir'
import type { AgentToolContext } from '../AgentToolContext'
import type { ShellService } from '../ShellService'

export async function executeShell(
  ctx: AgentToolContext,
  shellService: ShellService,
  args: Record<string, unknown>
): Promise<ToolDispatchResult> {
  const command = String(args.command ?? '')
  if (!command) return 'Error: command is required'

  const result = await shellService.execute({
    command,
    workingDirectory: args.working_directory ? String(args.working_directory) : undefined,
    blockUntilMs: args.block_until_ms !== undefined ? Number(args.block_until_ms) : undefined,
    description: args.description ? String(args.description) : undefined,
    workspaceRoot: ctx.workspaceRoot,
    sessionId: ctx.sessionId ?? 'default',
    terminalsDir: shellService.getTerminalsDirectory()
  })

  const parts = [result.output]
  if (result.exitCode !== null && result.exitCode !== 0) {
    parts.push(`\nExit code: ${result.exitCode}`)
  }
  if (result.backgrounded && result.shellId) {
    parts.push(`\nShell id: ${result.shellId}`)
  }
  const directoryPath = detectMkdirPath(
    command,
    ctx.workspaceRoot,
    args.working_directory ? String(args.working_directory) : undefined
  )

  if (directoryPath) {
    return { content: parts.join(''), directoryPath }
  }

  return parts.join('')
}
