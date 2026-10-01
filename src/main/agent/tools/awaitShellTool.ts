import fs from 'fs/promises'
import type { ToolDispatchResult } from '../../../shared/agent/toolDispatch'
import type { AgentToolContext } from '../AgentToolContext'
import type { ShellService } from '../ShellService'

const MAX_BLOCK_MS = 7_140_000

export async function executeAwaitShell(
  ctx: AgentToolContext,
  shellService: ShellService,
  args: Record<string, unknown>
): Promise<ToolDispatchResult> {
  const shellId = typeof args.shell_id === 'string' && args.shell_id.trim() ? args.shell_id.trim() : undefined
  let blockUntilMs = args.block_until_ms !== undefined ? Number(args.block_until_ms) : 30_000
  if (Number.isNaN(blockUntilMs)) blockUntilMs = 30_000
  blockUntilMs = Math.max(0, Math.min(blockUntilMs, MAX_BLOCK_MS))

  const pattern = typeof args.pattern === 'string' && args.pattern.trim() ? args.pattern : undefined
  let regex: RegExp | null = null
  if (pattern) {
    try {
      regex = new RegExp(pattern, 'm')
    } catch (err) {
      return `Error: Invalid pattern regex: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  if (!shellId) {
    if (blockUntilMs === 0) {
      return 'Error: shell_id is required when block_until_ms is 0'
    }
    await sleep(blockUntilMs)
    return `Waited ${blockUntilMs}ms`
  }

  const terminalFile = shellService.getTerminalFile(shellId)
  if (!terminalFile) {
    return `Error: Unknown shell id: ${shellId}`
  }

  if (blockUntilMs === 0) {
    const snapshot = await readTerminalSnapshot(terminalFile)
    return formatAwaitOutput(shellId, snapshot, false)
  }

  const started = Date.now()
  while (Date.now() - started < blockUntilMs) {
    const snapshot = await readTerminalSnapshot(terminalFile)
    if (snapshot.exitCode !== undefined) {
      return formatAwaitOutput(shellId, snapshot, true)
    }
    if (regex && regex.test(snapshot.body)) {
      return formatAwaitOutput(shellId, snapshot, false, 'Pattern matched')
    }
    await sleep(Math.min(500, blockUntilMs - (Date.now() - started)))
  }

  const snapshot = await readTerminalSnapshot(terminalFile)
  return formatAwaitOutput(shellId, snapshot, snapshot.exitCode !== undefined, 'Timed out waiting')
}

type TerminalSnapshot = {
  body: string
  exitCode?: number
  elapsedMs?: number
  runningForMs?: number
}

async function readTerminalSnapshot(filePath: string): Promise<TerminalSnapshot> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return parseTerminalFile(raw)
  } catch {
    return { body: '(terminal file not found)' }
  }
}

function parseTerminalFile(raw: string): TerminalSnapshot {
  const headerEnd = raw.indexOf('\n---\n')
  const bodyStart = headerEnd >= 0 ? headerEnd + 5 : 0
  let body = raw.slice(bodyStart)

  let exitCode: number | undefined
  let elapsedMs: number | undefined
  let runningForMs: number | undefined

  const header = headerEnd >= 0 ? raw.slice(0, headerEnd) : ''
  const runningMatch = header.match(/^running_for_ms:\s*(\d+)/m)
  if (runningMatch) runningForMs = Number(runningMatch[1])

  const footerMatch = body.match(/\n---\nexit_code:\s*(-?\d+)\nelapsed_ms:\s*(\d+)\n---\s*$/)
  if (footerMatch) {
    exitCode = Number(footerMatch[1])
    elapsedMs = Number(footerMatch[2])
    body = body.slice(0, footerMatch.index)
  }

  return { body, exitCode, elapsedMs, runningForMs }
}

function formatAwaitOutput(
  shellId: string,
  snapshot: TerminalSnapshot,
  completed: boolean,
  note?: string
): string {
  const parts = [`Shell ${shellId}${completed ? ' completed' : ' status'}:`]
  if (note) parts.push(note)
  if (snapshot.runningForMs !== undefined) parts.push(`running_for_ms: ${snapshot.runningForMs}`)
  if (snapshot.exitCode !== undefined) {
    parts.push(`exit_code: ${snapshot.exitCode}`)
    if (snapshot.elapsedMs !== undefined) parts.push(`elapsed_ms: ${snapshot.elapsedMs}`)
  }
  parts.push('', snapshot.body.trim() || '(no output)')
  return parts.join('\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
