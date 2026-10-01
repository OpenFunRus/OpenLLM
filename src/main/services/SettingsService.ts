import fs from 'fs'
import path from 'path'
import type { App } from 'electron'
import type { AppSettings } from '../../shared/types'
import { AGENT_SETTINGS_DEFAULTS } from '../../shared/agent/agentSettings'

const defaults: AppSettings = {
  theme: 'dark',
  recentWorkspaces: [],
  lastWorkspacePath: null,
  githubPat: '',
  tavilyApiKey: '',
  gitAuthorName: '',
  gitAuthorEmail: '',
  apiModels: [],
  activeModelId: null,
  editorFontSize: 15,
  editorTabSize: 2,
  sidebarWidth: 260,
  aiPanelWidth: 360,
  terminalHeight: 240,
  ...AGENT_SETTINGS_DEFAULTS
}

const getSettingsPath = () => {
  const { app } = require('electron') as { app: App }
  return path.join(app.getPath('userData'), 'settings.json')
}

type PersistedWindowState = {
  windowBounds?: Electron.Rectangle
  windowMaximized?: boolean
}

class SettingsService {
  private data: AppSettings & PersistedWindowState = { ...defaults }
  private loaded = false

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = fs.readFileSync(getSettingsPath(), 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      let merged: AppSettings & PersistedWindowState = {
        ...defaults,
        ...parsed,
        apiModels: parsed.apiModels ?? [],
      }
      if ((merged.agentLimitsVersion ?? 0) < 2) {
        merged = {
          ...merged,
          agentMaxSteps: AGENT_SETTINGS_DEFAULTS.agentMaxSteps,
          agentMaxWallTimeMin: AGENT_SETTINGS_DEFAULTS.agentMaxWallTimeMin,
          agentAutoContinue: parsed.agentAutoContinue ?? AGENT_SETTINGS_DEFAULTS.agentAutoContinue,
          agentContextStopPercent:
            parsed.agentContextStopPercent ?? AGENT_SETTINGS_DEFAULTS.agentContextStopPercent,
          agentLimitsVersion: 2,
        }
        this.data = merged
        this.save()
      } else {
        this.data = merged
      }
    } catch {
      // File doesn't exist yet — use defaults
    }
  }

  private save(): void {
    try {
      const settingsPath = getSettingsPath()
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
      fs.writeFileSync(settingsPath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error('SettingsService: failed to save', err)
    }
  }

  get<K extends keyof (AppSettings & PersistedWindowState)>(
    key: K
  ): (AppSettings & PersistedWindowState)[K] {
    this.load()
    return this.data[key]
  }

  set<K extends keyof (AppSettings & PersistedWindowState)>(
    key: K,
    value: (AppSettings & PersistedWindowState)[K]
  ): void {
    this.load()
    this.data[key] = value
    this.save()
  }

  addRecentWorkspace(wsPath: string): void {
    this.load()
    const recent = (this.data.recentWorkspaces ?? []).filter((p) => p !== wsPath)
    recent.unshift(wsPath)
    this.data.recentWorkspaces = recent.slice(0, 10)
    this.save()
  }

  getAll(): AppSettings {
    this.load()
    return { ...this.data }
  }
}

export const settingsService = new SettingsService()
