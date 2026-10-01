import path from 'path'
import type { AgentMode } from '../../shared/agent/types'
import { workspaceService } from '../services/WorkspaceService'
import type { ShellService } from './ShellService'

export type AgentToolContext = {
  workspaceRoot: string | null
  sessionId?: string
  runId?: string
  shellService?: ShellService
  /** When set, only these tool names may execute (local subagents). */
  allowedTools?: Set<string>
  /** Called when the user approves SwitchMode mid-run. */
  onModeSwitch?: (mode: AgentMode) => void
}

export function createAgentToolContext(
  sessionId?: string,
  shellService?: ShellService,
  runId?: string,
  allowedTools?: Set<string>,
  onModeSwitch?: (mode: AgentMode) => void
): AgentToolContext {
  return {
    workspaceRoot: workspaceService.current?.path ?? null,
    sessionId,
    runId,
    shellService,
    allowedTools,
    onModeSwitch,
  }
}

/**
 * Resolve paths for agent tools.
 * Relative paths require an open workspace (Cursor always has workspace root).
 */
export function resolveAgentPath(ctx: AgentToolContext, filePath: string): string | null {
  const trimmed = filePath.trim()
  if (!trimmed) return null
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed)
  if (!ctx.workspaceRoot) return null
  return path.normalize(path.join(ctx.workspaceRoot, trimmed))
}

export function resolveAgentPathOrError(ctx: AgentToolContext, filePath: string): string {
  const resolved = resolveAgentPath(ctx, filePath)
  if (!resolved) {
    throw new Error(
      ctx.workspaceRoot
        ? `Invalid path: ${filePath}`
        : `No workspace folder open — open a project folder or use an absolute path (got: ${filePath})`
    )
  }
  return resolved
}
