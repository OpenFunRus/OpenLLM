import fs from 'fs'
import path from 'path'
import type { App } from 'electron'
import type { AppSettings, RecentWorkspace } from '../../shared/types'
import { AGENT_SETTINGS_DEFAULTS } from '../../shared/agent/agentSettings'

const RECENT_WORKSPACE_LIMIT = 15

const defaults: AppSettings = {
  theme: 'dark',
  recentWorkspaces: [],
  lastWorkspacePath: null,
  tavilyApiKey: '',
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

function normalizeRecentWorkspaces(raw: unknown, fallbackDate: string): RecentWorkspace[] {
  if (!Array.isArray(raw)) return []

  const items: RecentWorkspace[] = []
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      items.push({ path: item, lastOpenedAt: fallbackDate })
      continue
    }
    if (item && typeof item === 'object' && typeof (item as RecentWorkspace).path === 'string') {
      const entry = item as RecentWorkspace
      items.push({
        path: entry.path,
        lastOpenedAt: entry.lastOpenedAt || fallbackDate,
      })
    }
  }

  const byPath = new Map<string, RecentWorkspace>()
  for (const entry of items) {
    const existing = byPath.get(entry.path)
    if (!existing || entry.lastOpenedAt > existing.lastOpenedAt) {
      byPath.set(entry.path, entry)
    }
  }

  return [...byPath.values()]
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .slice(0, RECENT_WORKSPACE_LIMIT)
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
      const fallbackDate = new Date().toISOString()
      let merged: AppSettings & PersistedWindowState = {
        ...defaults,
        ...parsed,
        apiModels: parsed.apiModels ?? [],
        recentWorkspaces: normalizeRecentWorkspaces(parsed.recentWorkspaces, fallbackDate),
      }

      if (merged.lastWorkspacePath) {
        const exists = merged.recentWorkspaces.some((item) => item.path === merged.lastWorkspacePath)
        if (!exists) {
          merged.recentWorkspaces = normalizeRecentWorkspaces(
            [{ path: merged.lastWorkspacePath, lastOpenedAt: fallbackDate }, ...merged.recentWorkspaces],
            fallbackDate
          )
        }
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
      }

      if ((merged.agentLimitsVersion ?? 0) < 3) {
        const legacyPercent =
          parsed.agentSummarizeAtPercent
          ?? parsed.agentContextStopPercent
          ?? AGENT_SETTINGS_DEFAULTS.agentSummarizeAtPercent
        merged = {
          ...merged,
          agentSummarizeEnabled:
            parsed.agentSummarizeEnabled ?? AGENT_SETTINGS_DEFAULTS.agentSummarizeEnabled,
          agentSummarizeAtPercent: legacyPercent,
          agentSummarizeTargetRatio:
            parsed.agentSummarizeTargetRatio ?? AGENT_SETTINGS_DEFAULTS.agentSummarizeTargetRatio,
          agentSummarizeKeepRecentTurns:
            parsed.agentSummarizeKeepRecentTurns
            ?? AGENT_SETTINGS_DEFAULTS.agentSummarizeKeepRecentTurns,
          agentSummarizeMode:
            parsed.agentSummarizeMode ?? AGENT_SETTINGS_DEFAULTS.agentSummarizeMode,
          agentSummarizePreSqueeze:
            parsed.agentSummarizePreSqueeze ?? AGENT_SETTINGS_DEFAULTS.agentSummarizePreSqueeze,
          agentSummarizeModelId:
            parsed.agentSummarizeModelId ?? AGENT_SETTINGS_DEFAULTS.agentSummarizeModelId,
          agentContextStopPercent:
            parsed.agentContextStopPercent ?? AGENT_SETTINGS_DEFAULTS.agentContextStopPercent,
          agentLimitsVersion: 3,
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
    const now = new Date().toISOString()
    const recent = this.getRecentWorkspaces().filter((item) => item.path !== wsPath)
    recent.unshift({ path: wsPath, lastOpenedAt: now })
    this.data.recentWorkspaces = recent.slice(0, RECENT_WORKSPACE_LIMIT)
    this.data.lastWorkspacePath = wsPath
    this.save()
  }

  getRecentWorkspaces(): RecentWorkspace[] {
    this.load()
    return [...(this.data.recentWorkspaces ?? [])].sort((a, b) =>
      b.lastOpenedAt.localeCompare(a.lastOpenedAt)
    )
  }

  getAll(): AppSettings {
    this.load()
    return { ...this.data }
  }
}

export const settingsService = new SettingsService()
