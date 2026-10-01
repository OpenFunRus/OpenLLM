import fs from 'fs'
import path from 'path'
import type { IpcMain } from 'electron'
import type { McpConfigFile } from '../services/mcpRegistry'
import { mcpRegistry } from '../services/mcpRegistry'
import { workspaceService } from '../services/WorkspaceService'

function getUserMcpPath(): string {
  const { app } = require('electron') as { app: { getPath: (name: string) => string } }
  return path.join(app.getPath('userData'), 'mcp.json')
}

function getWorkspaceMcpPath(): string | null {
  const root = workspaceService.current?.path
  if (!root) return null
  return path.join(root, '.openllm', 'mcp.json')
}

export function registerMcpConfigHandlers(): void {
  const { ipcMain } = require('electron') as { ipcMain: IpcMain }

  ipcMain.handle('mcp:getConfig', (_e, scope: 'user' | 'workspace' = 'user') => {
    const filePath = scope === 'workspace' ? getWorkspaceMcpPath() : getUserMcpPath()
    if (!filePath) {
      return { path: null, config: { mcpServers: {} } satisfies McpConfigFile, exists: false }
    }
    try {
      if (!fs.existsSync(filePath)) {
        return { path: filePath, config: { mcpServers: {} }, exists: false }
      }
      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as McpConfigFile
      return { path: filePath, config, exists: true }
    } catch {
      return { path: filePath, config: { mcpServers: {} }, exists: false, parseError: true }
    }
  })

  ipcMain.handle(
    'mcp:setConfig',
    (_e, payload: { scope: 'user' | 'workspace'; config: McpConfigFile }) => {
      const filePath =
        payload.scope === 'workspace' ? getWorkspaceMcpPath() : getUserMcpPath()
      if (!filePath) {
        throw new Error('No workspace open — cannot save workspace MCP config')
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, `${JSON.stringify(payload.config, null, 2)}\n`, 'utf-8')
      mcpRegistry.clear()
      return { path: filePath, ok: true }
    }
  )

  ipcMain.handle('mcp:getConfigPaths', () => ({
    user: getUserMcpPath(),
    workspace: getWorkspaceMcpPath(),
  }))
}
