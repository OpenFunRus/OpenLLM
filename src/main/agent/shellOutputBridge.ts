import type { WebContents } from 'electron'

export type ShellOutputPayload = {
  command: string
  data: string
  shellId?: string
  stderr?: boolean
}

type SessionSink = {
  sender: WebContents
}

const sessionSinks = new Map<string, Set<SessionSink>>()

export function registerShellOutputListener(sessionId: string, sender: WebContents): () => void {
  const sink: SessionSink = { sender }
  let set = sessionSinks.get(sessionId)
  if (!set) {
    set = new Set()
    sessionSinks.set(sessionId, set)
  }
  set.add(sink)

  return () => {
    set!.delete(sink)
    if (set!.size === 0) sessionSinks.delete(sessionId)
  }
}

export function emitShellOutput(sessionId: string, payload: ShellOutputPayload): void {
  const set = sessionSinks.get(sessionId)
  if (!set) return

  for (const { sender } of set) {
    if (!sender.isDestroyed()) {
      sender.send(`agent:shellOutput:${sessionId}`, payload)
    }
  }
}
