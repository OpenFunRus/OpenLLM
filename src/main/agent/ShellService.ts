import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fs from 'fs'
import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { emitShellOutput } from './shellOutputBridge'

export type ShellExecOptions = {
  command: string
  workingDirectory?: string
  blockUntilMs?: number
  description?: string
  workspaceRoot: string | null
  sessionId: string
  terminalsDir: string
}

export type ShellExecResult = {
  output: string
  exitCode: number | null
  shellId?: string
  backgrounded?: boolean
  terminalFile?: string
  elapsedMs: number
}

type ShellJob = {
  id: string
  proc: ChildProcessWithoutNullStreams
  terminalFile: string
  startedAt: number
  command: string
  cwd: string
}

export class ShellService {
  private cwd: string
  private readonly jobs = new Map<string, ShellJob>()

  constructor(
    private readonly workspaceRoot: string | null,
    private readonly sessionId: string,
    private readonly terminalsDir: string
  ) {
    this.cwd = workspaceRoot ?? process.cwd()
  }

  getTerminalsDirectory(): string {
    return this.terminalsDir
  }

  private ensureTerminalsDir(): void {
    fs.mkdirSync(this.terminalsDir, { recursive: true })
  }

  killAllJobs(): void {
    for (const job of this.jobs.values()) {
      try {
        job.proc.kill()
      } catch { /* ignore */ }
    }
    this.jobs.clear()
  }

  getTerminalFile(shellId: string): string | null {
    const job = this.jobs.get(shellId)
    if (job) return job.terminalFile
    const candidate = path.join(this.terminalsDir, `${shellId}.txt`)
    return fs.existsSync(candidate) ? candidate : null
  }

  async execute(opts: ShellExecOptions): Promise<ShellExecResult> {
    const blockUntilMs = opts.blockUntilMs ?? 30_000
    const cwd = opts.workingDirectory
      ? path.isAbsolute(opts.workingDirectory)
        ? opts.workingDirectory
        : path.join(this.cwd, opts.workingDirectory)
      : this.cwd

    this.cwd = cwd

    if (blockUntilMs === 0) {
      return this.startBackground(opts.command, cwd)
    }

    const started = Date.now()
    try {
      const result = await this.runForeground(opts.command, cwd, blockUntilMs)
      return { ...result, elapsedMs: Date.now() - started }
    } catch (err) {
      if (err instanceof BackgroundTimeoutError) {
        return {
          output: err.partialOutput + `\n\n(Command moved to background. Terminal file: ${err.terminalFile})`,
          exitCode: null,
          shellId: err.shellId,
          backgrounded: true,
          terminalFile: err.terminalFile,
          elapsedMs: Date.now() - started
        }
      }
      throw err
    }
  }

  private async runForeground(
    command: string,
    cwd: string,
    blockUntilMs: number
  ): Promise<Omit<ShellExecResult, 'elapsedMs'>> {
    this.ensureTerminalsDir()
    const shellId = crypto.randomUUID().slice(0, 8)
    const terminalFile = path.join(this.terminalsDir, `${shellId}.txt`)
    const proc = this.spawnShell(command, cwd)
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      emitShellOutput(this.sessionId, { command, data: text, shellId, stderr: false })
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      emitShellOutput(this.sessionId, { command, data: text, shellId, stderr: true })
    })

    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timer = setTimeout(() => {
        const partial = stdout + stderr
        this.jobs.set(shellId, {
          id: shellId,
          proc,
          terminalFile,
          startedAt: Date.now(),
          command,
          cwd
        })
        void this.writeTerminalFile(terminalFile, {
          pid: proc.pid,
          cwd,
          command,
          runningForMs: blockUntilMs,
          body: partial
        })
        reject(new BackgroundTimeoutError(shellId, terminalFile, partial))
      }, blockUntilMs)

      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      proc.on('close', (code, signal) => {
        clearTimeout(timer)
        resolve({ code, signal })
      })
    })

    const combined = [stdout, stderr].filter(Boolean).join(stderr ? '\n' : '')
    await this.writeTerminalFile(terminalFile, {
      pid: proc.pid,
      cwd,
      command,
      runningForMs: 0,
      body: combined,
      exitCode: result.code,
      elapsedMs: 0
    })

    return {
      output: combined || '(no output)',
      exitCode: result.code,
      shellId,
      terminalFile
    }
  }

  private startBackground(command: string, cwd: string): ShellExecResult {
    this.ensureTerminalsDir()
    const shellId = crypto.randomUUID().slice(0, 8)
    const terminalFile = path.join(this.terminalsDir, `${shellId}.txt`)
    const proc = this.spawnShell(command, cwd)
    const startedAt = Date.now()
    let body = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      body += text
      emitShellOutput(this.sessionId, { command, data: text, shellId, stderr: false })
      void this.writeTerminalFile(terminalFile, {
        pid: proc.pid,
        cwd,
        command,
        runningForMs: Date.now() - startedAt,
        body
      })
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      body += text
      emitShellOutput(this.sessionId, { command, data: text, shellId, stderr: true })
      void this.writeTerminalFile(terminalFile, {
        pid: proc.pid,
        cwd,
        command,
        runningForMs: Date.now() - startedAt,
        body
      })
    })

    proc.on('close', (code) => {
      void this.writeTerminalFile(terminalFile, {
        pid: proc.pid,
        cwd,
        command,
        runningForMs: Date.now() - startedAt,
        body,
        exitCode: code,
        elapsedMs: Date.now() - startedAt
      })
      this.jobs.delete(shellId)
    })

    this.jobs.set(shellId, { id: shellId, proc, terminalFile, startedAt, command, cwd })

    void this.writeTerminalFile(terminalFile, {
      pid: proc.pid,
      cwd,
      command,
      runningForMs: 0,
      body: ''
    })

    return {
      output: `Background shell started (id: ${shellId}). Output: ${terminalFile}`,
      exitCode: null,
      shellId,
      backgrounded: true,
      terminalFile,
      elapsedMs: 0
    }
  }

  private spawnShell(command: string, cwd: string): ChildProcessWithoutNullStreams {
    if (os.platform() === 'win32') {
      return spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        cwd,
        env: process.env as Record<string, string>,
        windowsHide: true
      })
    }
    return spawn(process.env.SHELL ?? '/bin/bash', ['-lc', command], {
      cwd,
      env: process.env as Record<string, string>
    })
  }

  private async writeTerminalFile(
    filePath: string,
    meta: {
      pid?: number
      cwd: string
      command: string
      runningForMs: number
      body: string
      exitCode?: number | null
      elapsedMs?: number
    }
  ): Promise<void> {
    const header = [
      '---',
      `pid: ${meta.pid ?? 'unknown'}`,
      `cwd: ${meta.cwd}`,
      `last_command: ${meta.command}`,
      `running_for_ms: ${meta.runningForMs}`,
      '---',
      meta.body
    ].join('\n')

    const footer =
      meta.exitCode !== undefined
        ? `\n---\nexit_code: ${meta.exitCode}\nelapsed_ms: ${meta.elapsedMs ?? 0}\n---`
        : ''

    await fsPromises.writeFile(filePath, header + footer, 'utf-8')
  }
}

class BackgroundTimeoutError extends Error {
  constructor(
    readonly shellId: string,
    readonly terminalFile: string,
    readonly partialOutput: string
  ) {
    super('Shell command timed out')
    this.name = 'BackgroundTimeoutError'
  }
}

/** Windows disallows `:` in path segments — subagent ids like `subagent:parent:id` must be sanitized. */
export function sanitizeSessionIdForPath(sessionId: string): string {
  const trimmed = sessionId.trim()
  if (!trimmed) return 'default'
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'default'
}

export function createTerminalsDir(userDataPath: string, sessionId: string): string {
  const safeSessionId = sanitizeSessionIdForPath(sessionId)
  return path.join(userDataPath, 'agent-sessions', safeSessionId, 'terminals')
}
