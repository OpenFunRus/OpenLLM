import fs from 'fs'
import path from 'path'
import type { IpcMain, Dialog, Shell } from 'electron'
import { fileService } from '../services/FileService'
import { workspaceService } from '../services/WorkspaceService'
import type { ImageAttachment } from '../../shared/types'
import {
  MEDIA_ATTACHMENT_EXTENSIONS,
  fileExtensionFromPath,
  mimeFromExt,
} from '../../shared/attachmentUtils'

export function registerFsHandlers(): void {
  const { ipcMain, dialog, shell } = require('electron') as {
    ipcMain: IpcMain
    dialog: Dialog
    shell: Shell
  }

  ipcMain.handle('fs:tree', (_e, dirPath: string) => fileService.getFileTree(dirPath))
  ipcMain.handle('fs:read', (_e, filePath: string) => fileService.readFile(filePath))
  ipcMain.handle('fs:write', (_e, filePath: string, content: string) => fileService.writeFile(filePath, content))
  ipcMain.handle('fs:create', (_e, filePath: string) => fileService.createFile(filePath))
  ipcMain.handle('fs:mkdir', (_e, dirPath: string) => fileService.createDirectory(dirPath))
  ipcMain.handle('fs:delete', (_e, targetPath: string) => fileService.delete(targetPath))
  ipcMain.handle('fs:removeIfEmpty', (_e, dirPath: string) => fileService.removeIfEmpty(dirPath))
  ipcMain.handle('fs:rename', (_e, oldPath: string, newPath: string) => fileService.rename(oldPath, newPath))
  ipcMain.handle('fs:copy', (_e, sourcePath: string, destPath: string) => fileService.copy(sourcePath, destPath))

  ipcMain.handle('workspace:openDialog', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return workspaceService.open(result.filePaths[0])
  })

  ipcMain.handle('workspace:open', (_e, folderPath: string) => {
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Папка не найдена: ${folderPath}`)
    }
    return workspaceService.open(folderPath)
  })
  ipcMain.handle('workspace:recent', () => workspaceService.getRecent())
  ipcMain.handle('workspace:close', () => workspaceService.close())

  ipcMain.handle('shell:openPath', (_e, targetPath: string) => shell.openPath(targetPath))

  // File watching: renderer subscribes and gets a cleanup id
  const watchCleanups = new Map<string, () => void>()
  ipcMain.handle('fs:watch', (event, dirPath: string) => {
    const existing = watchCleanups.get(dirPath)
    if (existing) existing()
    const stop = fileService.watchDirectory(dirPath, (eventType, filePath) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('fs:changed', { eventType, filePath })
      }
    })
    watchCleanups.set(dirPath, stop)
  })

  ipcMain.handle('fs:unwatch', (_e, dirPath: string) => {
    const stop = watchCleanups.get(dirPath)
    if (stop) { stop(); watchCleanups.delete(dirPath) }
  })

  ipcMain.handle('dialog:pickImages', async (): Promise<ImageAttachment[]> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images & PDF', extensions: [...MEDIA_ATTACHMENT_EXTENSIONS] }],
    })
    if (result.canceled || result.filePaths.length === 0) return []

    return result.filePaths.map((filePath) => {
      const ext = fileExtensionFromPath(filePath)
      return {
        path: filePath,
        name: path.basename(filePath),
        mimeType: mimeFromExt(ext),
        base64: fs.readFileSync(filePath).toString('base64'),
      }
    })
  })

  ipcMain.handle('fs:readAttachment', (_e, filePath: string): ImageAttachment => {
    const ext = fileExtensionFromPath(filePath)
    return {
      path: filePath,
      name: path.basename(filePath),
      mimeType: mimeFromExt(ext),
      base64: fs.readFileSync(filePath).toString('base64'),
    }
  })
}
