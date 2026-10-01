import fs from 'fs'
import path from 'path'
import type { IpcMain, Dialog } from 'electron'
import { fileService } from '../services/FileService'
import { workspaceService } from '../services/WorkspaceService'
import type { ImageAttachment } from '../../shared/types'

const ATTACHMENT_EXTENSIONS = [
  'xbm', 'tif', 'jfif', 'pjp', 'apng', 'jpe', 'jpeg', 'heif', 'ico', 'tiff',
  'webp', 'svgz', 'jpg', 'heic', 'gif', 'svg', 'png', 'bmp', 'pjpeg', 'avif', 'pdf',
]

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjp: 'image/jpeg', pjpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon',
    svg: 'image/svg+xml', svgz: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
    heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', apng: 'image/apng', xbm: 'image/x-xbitmap',
    pdf: 'application/pdf',
  }
  return map[ext] ?? 'application/octet-stream'
}

export function registerFsHandlers(): void {
  const { ipcMain, dialog } = require('electron') as { ipcMain: IpcMain; dialog: Dialog }

  ipcMain.handle('fs:tree', (_e, dirPath: string) => fileService.getFileTree(dirPath))
  ipcMain.handle('fs:read', (_e, filePath: string) => fileService.readFile(filePath))
  ipcMain.handle('fs:write', (_e, filePath: string, content: string) => fileService.writeFile(filePath, content))
  ipcMain.handle('fs:create', (_e, filePath: string) => fileService.createFile(filePath))
  ipcMain.handle('fs:mkdir', (_e, dirPath: string) => fileService.createDirectory(dirPath))
  ipcMain.handle('fs:delete', (_e, targetPath: string) => fileService.delete(targetPath))
  ipcMain.handle('fs:removeIfEmpty', (_e, dirPath: string) => fileService.removeIfEmpty(dirPath))
  ipcMain.handle('fs:rename', (_e, oldPath: string, newPath: string) => fileService.rename(oldPath, newPath))

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
      filters: [{ name: 'Images & PDF', extensions: ATTACHMENT_EXTENSIONS }],
    })
    if (result.canceled || result.filePaths.length === 0) return []

    return result.filePaths.map((filePath) => {
      const ext = path.extname(filePath).slice(1).toLowerCase()
      return {
        path: filePath,
        name: path.basename(filePath),
        mimeType: mimeFromExt(ext),
        base64: fs.readFileSync(filePath).toString('base64'),
      }
    })
  })
}
