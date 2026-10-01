import type { IpcMain } from 'electron'
import { gitService } from '../services/GitService'

export function registerGitHandlers(): void {
  const { ipcMain } = require('electron') as { ipcMain: IpcMain }

  ipcMain.handle('git:isRepo', (_e, cwd: string) => gitService.isRepository(cwd))
  ipcMain.handle('git:info', (_e, cwd: string) => gitService.getInfo(cwd))
  ipcMain.handle('git:status', (_e, cwd: string) => gitService.getStatus(cwd))
  ipcMain.handle('git:stage', (_e, cwd: string, filePath: string) => gitService.stage(cwd, filePath))
  ipcMain.handle('git:stageAll', (_e, cwd: string) => gitService.stageAll(cwd))
  ipcMain.handle('git:unstage', (_e, cwd: string, filePath: string) => gitService.unstage(cwd, filePath))
  ipcMain.handle('git:commit', (_e, cwd: string, message: string, name: string, email: string) =>
    gitService.commit(cwd, message, name, email)
  )
  ipcMain.handle('git:push', (_e, cwd: string, pat?: string) => gitService.push(cwd, pat))
  ipcMain.handle('git:pull', (_e, cwd: string, pat?: string) => gitService.pull(cwd, pat))
  ipcMain.handle('git:branches', (_e, cwd: string) => gitService.getBranches(cwd))
  ipcMain.handle('git:checkout', (_e, cwd: string, branch: string, create: boolean) =>
    gitService.checkoutBranch(cwd, branch, create)
  )
  ipcMain.handle('git:init', (_e, cwd: string) => gitService.init(cwd))
  ipcMain.handle('git:diff', (_e, cwd: string, filePath: string) => gitService.getFileDiff(cwd, filePath))
}
