import type { App } from 'electron'
import { workspaceService } from '../services/WorkspaceService'
import { ShellService, createTerminalsDir } from './ShellService'

const shellServices = new Map<string, ShellService>()

export function killSessionShellJobs(sessionId: string): void {
  shellServices.get(sessionId)?.killAllJobs()
}

export function getShellService(sessionId: string, workspaceRoot?: string | null): ShellService {
  const existing = shellServices.get(sessionId)
  if (existing) return existing

  const root = workspaceRoot ?? workspaceService.current?.path ?? null
  const { app } = require('electron') as { app: App }
  const terminalsDir = createTerminalsDir(app.getPath('userData'), sessionId)
  const svc = new ShellService(root, sessionId, terminalsDir)
  shellServices.set(sessionId, svc)
  return svc
}
