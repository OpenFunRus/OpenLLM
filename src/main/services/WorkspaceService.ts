import path from 'path'
import { settingsService } from './SettingsService'
import type { WorkspaceInfo } from '../../shared/types'

class WorkspaceService {
  private _current: WorkspaceInfo | null = null

  get current(): WorkspaceInfo | null { return this._current }

  open(folderPath: string): WorkspaceInfo {
    const info: WorkspaceInfo = {
      name: path.basename(folderPath),
      path: folderPath
    }
    this._current = info
    settingsService.set('lastWorkspacePath', folderPath)
    settingsService.addRecentWorkspace(folderPath)
    return info
  }

  close(): void { this._current = null }

  getRecent(): WorkspaceInfo[] {
    return settingsService
      .get('recentWorkspaces')
      .map((p) => ({ name: path.basename(p), path: p }))
  }
}

export const workspaceService = new WorkspaceService()
