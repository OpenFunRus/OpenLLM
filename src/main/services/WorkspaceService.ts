import fs from 'fs'
import path from 'path'
import { settingsService } from './SettingsService'
import type { RecentWorkspaceInfo, WorkspaceInfo } from '../../shared/types'

class WorkspaceService {
  private _current: WorkspaceInfo | null = null

  get current(): WorkspaceInfo | null { return this._current }

  open(folderPath: string): WorkspaceInfo {
    const info: WorkspaceInfo = {
      name: path.basename(folderPath),
      path: folderPath
    }
    this._current = info
    settingsService.addRecentWorkspace(folderPath)
    return info
  }

  close(): void { this._current = null }

  getRecent(): RecentWorkspaceInfo[] {
    const entries = settingsService.getRecentWorkspaces()
    const valid = entries.filter((entry) => fs.existsSync(entry.path))

    if (valid.length !== entries.length) {
      settingsService.set('recentWorkspaces', valid)
    }

    return valid.map((entry) => ({
      name: path.basename(entry.path),
      path: entry.path,
      lastOpenedAt: entry.lastOpenedAt,
    }))
  }
}

export const workspaceService = new WorkspaceService()
