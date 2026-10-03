import os from 'os'

// node-pty is a native module — lazy import to avoid startup cost
let pty: typeof import('node-pty')

async function ensurePty(): Promise<void> {
  if (!pty) pty = await import('node-pty')
}

interface TerminalSession {
  pty: import('node-pty').IPty
  cwd: string
}

class TerminalService {
  private sessions = new Map<string, TerminalSession>()

  async create(
    id: string,
    cwd: string,
    onData: (data: string) => void,
    shellOverride?: string,
  ): Promise<{ cols: number; rows: number }> {
    await ensurePty()
    this.kill(id)

    const shell = shellOverride ?? (os.platform() === 'win32'
      ? (process.env.COMSPEC ?? 'cmd.exe')
      : (process.env.SHELL ?? '/bin/bash'))

    const cols = 120
    const rows = 30

    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || process.cwd(),
      env: process.env as Record<string, string>
    })

    proc.onData(onData)
    this.sessions.set(id, { pty: proc, cwd })
    return { cols, rows }
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.pty.resize(cols, rows)
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      try { session.pty.kill() } catch { /* already dead */ }
      this.sessions.delete(id)
    }
  }

  killAll(): void {
    for (const id of this.sessions.keys()) this.kill(id)
  }
}

export const terminalService = new TerminalService()
