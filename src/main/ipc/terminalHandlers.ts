import type { IpcMain } from 'electron'
import { terminalService } from '../services/TerminalService'

export function registerTerminalHandlers(): void {
  const { ipcMain } = require('electron') as { ipcMain: IpcMain }

  ipcMain.handle('term:create', async (event, id: string, cwd: string) => {
    return terminalService.create(id, cwd, (data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`term:data:${id}`, data)
      }
    })
  })

  ipcMain.handle('term:write', (_e, id: string, data: string) => terminalService.write(id, data))
  ipcMain.handle('term:resize', (_e, id: string, cols: number, rows: number) =>
    terminalService.resize(id, cols, rows)
  )
  ipcMain.handle('term:kill', (_e, id: string) => terminalService.kill(id))
}
