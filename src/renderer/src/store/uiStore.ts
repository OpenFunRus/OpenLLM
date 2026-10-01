import { create } from 'zustand'
import type { AppSettings } from '../../../shared/types'
import type { ComposerMode, PendingAskQuestion, PendingSwitchMode } from '../../../shared/agent/types'

type SidebarPanel = 'files' | 'git' | 'models' | 'github'
type Theme = 'dark' | 'light'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 600
const AI_PANEL_MIN = 280
const TERMINAL_MIN = 100
const TERMINAL_MAX = 600

export function getMaxAiPanelWidth(): number {
  if (typeof window === 'undefined') return 700
  return Math.max(AI_PANEL_MIN, Math.floor(window.innerWidth * 0.5))
}

let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleLayoutSave(state: Pick<UiState, 'sidebarWidth' | 'aiPanelWidth' | 'terminalHeight'>) {
  if (layoutSaveTimer) clearTimeout(layoutSaveTimer)
  layoutSaveTimer = setTimeout(() => {
    void window.api.setSetting('sidebarWidth', state.sidebarWidth)
    void window.api.setSetting('aiPanelWidth', state.aiPanelWidth)
    void window.api.setSetting('terminalHeight', state.terminalHeight)
  }, 400)
}

function clampSidebar(w: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(w, SIDEBAR_MAX))
}

function clampAiPanel(w: number): number {
  return Math.max(AI_PANEL_MIN, Math.min(w, getMaxAiPanelWidth()))
}

function clampTerminal(h: number): number {
  return Math.max(TERMINAL_MIN, Math.min(h, TERMINAL_MAX))
}

interface UiState {
  theme: Theme
  editorFontSize: number
  editorTabSize: number
  sidebarPanel: SidebarPanel
  sidebarVisible: boolean
  aiPanelVisible: boolean
  terminalVisible: boolean
  commandPaletteOpen: boolean
  modelManagerOpen: boolean
  githubModalOpen: boolean
  settingsOpen: boolean
  pendingAskQuestion: PendingAskQuestion | null
  pendingSwitchMode: PendingSwitchMode | null
  composerMode: ComposerMode
  statusMessage: string
  sidebarWidth: number
  aiPanelWidth: number
  terminalHeight: number

  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setEditorFontSize: (size: number) => void
  setEditorTabSize: (size: number) => void
  setSidebarPanel: (panel: SidebarPanel) => void
  toggleSidebar: () => void
  toggleAiPanel: () => void
  toggleTerminal: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setModelManagerOpen: (open: boolean) => void
  setGithubModalOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setPendingAskQuestion: (question: PendingAskQuestion | null) => void
  clearPendingAskQuestion: () => void
  setPendingSwitchMode: (request: PendingSwitchMode | null) => void
  clearPendingSwitchMode: () => void
  setComposerMode: (mode: ComposerMode) => void
  setStatusMessage: (msg: string, durationMs?: number) => void
  loadLayoutFromSettings: (settings: Pick<AppSettings, 'sidebarWidth' | 'aiPanelWidth' | 'terminalHeight'>) => void
  clampAiPanelToWindow: () => void
  setSidebarWidth: (w: number) => void
  setAiPanelWidth: (w: number) => void
  adjustSidebarWidth: (delta: number) => void
  adjustAiPanelWidth: (delta: number) => void
  setTerminalHeight: (h: number) => void
  setTerminalVisible: (visible: boolean) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'dark',
  editorFontSize: 15,
  editorTabSize: 2,
  sidebarPanel: 'files',
  sidebarVisible: true,
  aiPanelVisible: true,
  terminalVisible: false,
  commandPaletteOpen: false,
  modelManagerOpen: false,
  githubModalOpen: false,
  settingsOpen: false,
  pendingAskQuestion: null,
  pendingSwitchMode: null,
  composerMode: 'agent',
  statusMessage: '',
  sidebarWidth: 260,
  aiPanelWidth: 360,
  terminalHeight: 240,

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  setEditorFontSize: (size) => set({ editorFontSize: size }),
  setEditorTabSize: (size) => set({ editorTabSize: size }),

  setSidebarPanel: (panel) => set({ sidebarPanel: panel, sidebarVisible: true }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  toggleAiPanel: () => set((s) => ({ aiPanelVisible: !s.aiPanelVisible })),
  toggleTerminal: () => set((s) => ({ terminalVisible: !s.terminalVisible })),
  setTerminalVisible: (visible) => set({ terminalVisible: visible }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setModelManagerOpen: (open) => set({ modelManagerOpen: open }),
  setGithubModalOpen: (open) => set({ githubModalOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setPendingAskQuestion: (question) => set({ pendingAskQuestion: question }),

  clearPendingAskQuestion: () => set({ pendingAskQuestion: null }),

  setPendingSwitchMode: (request) => set({ pendingSwitchMode: request }),

  clearPendingSwitchMode: () => set({ pendingSwitchMode: null }),

  setComposerMode: (mode) => set({ composerMode: mode }),

  setStatusMessage: (msg, durationMs = 3000) => {
    set({ statusMessage: msg })
    if (durationMs > 0) setTimeout(() => set({ statusMessage: '' }), durationMs)
  },

  loadLayoutFromSettings: (settings) => {
    const sidebarWidth = clampSidebar(settings.sidebarWidth ?? 260)
    const aiPanelWidth = clampAiPanel(settings.aiPanelWidth ?? 360)
    const terminalHeight = clampTerminal(settings.terminalHeight ?? 240)
    set({ sidebarWidth, aiPanelWidth, terminalHeight })
  },

  clampAiPanelToWindow: () => {
    const { aiPanelWidth, sidebarWidth, terminalHeight } = get()
    const clamped = clampAiPanel(aiPanelWidth)
    if (clamped !== aiPanelWidth) {
      set({ aiPanelWidth: clamped })
      scheduleLayoutSave({ sidebarWidth, aiPanelWidth: clamped, terminalHeight })
    }
  },

  setSidebarWidth: (w) => {
    const sidebarWidth = clampSidebar(w)
    const { aiPanelWidth, terminalHeight } = get()
    set({ sidebarWidth })
    scheduleLayoutSave({ sidebarWidth, aiPanelWidth, terminalHeight })
  },

  setAiPanelWidth: (w) => {
    const aiPanelWidth = clampAiPanel(w)
    const { sidebarWidth, terminalHeight } = get()
    set({ aiPanelWidth })
    scheduleLayoutSave({ sidebarWidth, aiPanelWidth, terminalHeight })
  },

  adjustSidebarWidth: (delta) => {
    const sidebarWidth = clampSidebar(get().sidebarWidth + delta)
    const { aiPanelWidth, terminalHeight } = get()
    set({ sidebarWidth })
    scheduleLayoutSave({ sidebarWidth, aiPanelWidth, terminalHeight })
  },

  adjustAiPanelWidth: (delta) => {
    const aiPanelWidth = clampAiPanel(get().aiPanelWidth + delta)
    const { sidebarWidth, terminalHeight } = get()
    set({ aiPanelWidth })
    scheduleLayoutSave({ sidebarWidth, aiPanelWidth, terminalHeight })
  },

  setTerminalHeight: (h) => {
    const terminalHeight = clampTerminal(h)
    const { sidebarWidth, aiPanelWidth } = get()
    set({ terminalHeight })
    scheduleLayoutSave({ sidebarWidth, aiPanelWidth, terminalHeight })
  },
}))
