import type { IpcMain } from 'electron'
import { gitHubService } from '../services/GitHubService'
import type { CreatePROptions } from '../../shared/types'

export function registerGitHubHandlers(): void {
  const { ipcMain } = require('electron') as { ipcMain: IpcMain }

  ipcMain.handle('github:auth', (_e, pat: string) => gitHubService.authenticate(pat))
  ipcMain.handle('github:logout', () => gitHubService.logout())
  ipcMain.handle('github:status', () => ({
    isAuthenticated: gitHubService.isAuthenticated,
    username: gitHubService.username
  }))
  ipcMain.handle('github:repos', () => gitHubService.getRepos())
  ipcMain.handle('github:prs', (_e, owner: string, repo: string) => gitHubService.getPRs(owner, repo))
  ipcMain.handle('github:createPr', (_e, opts: CreatePROptions) => gitHubService.createPR(opts))
}
