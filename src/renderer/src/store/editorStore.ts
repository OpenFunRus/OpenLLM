import { create } from 'zustand'
import type { EditorTab, FileEditorTab } from '@shared/types'
import { isFileEditorTab } from '@shared/types'
import { t } from '@shared/i18n'

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  cursorLine: number
  cursorColumn: number
  revealLine: number | null
  revealTabId: string | null
  /** Bumped on each openTabAtLine with a line so reveal re-runs for an already-open tab. */
  revealNonce: number
  markdownPreview: Record<string, boolean>
  openTab: (path: string, name: string) => Promise<void>
  openTabAtLine: (path: string, name: string, line?: number) => Promise<void>
  openBrowserTab: () => void
  openConsoleTab: (cwd: string) => void
  openPowerShellTab: (cwd: string) => void
  setBrowserTabUrl: (id: string, url: string) => void
  clearRevealLine: () => void
  closeTab: (id: string) => void
  closeTabByPath: (filePath: string) => void
  renameTabPath: (oldPath: string, newPath: string, newName: string) => void
  setActiveTab: (id: string) => void
  setTabContent: (id: string, content: string) => void
  markDirty: (id: string, dirty: boolean) => void
  saveTab: (id: string) => Promise<void>
  saveActiveTab: () => Promise<void>
  setCursorPosition: (line: number, column: number) => void
  toggleMarkdownPreview: (id: string) => void
  isMarkdownPreview: (id: string) => boolean
}

let _nextId = 1
const _autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function normalizeTabPath(path: string): string {
  return path.replace(/\//g, '\\')
}

function pathsEqual(a: string, b: string): boolean {
  return normalizeTabPath(a).toLowerCase() === normalizeTabPath(b).toLowerCase()
}

function nextTabId(): string {
  return String(_nextId++)
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  cursorLine: 1,
  cursorColumn: 1,
  revealLine: null,
  revealTabId: null,
  revealNonce: 0,
  markdownPreview: {},

  openTab: async (path: string, name: string) => {
    await get().openTabAtLine(path, name)
  },

  openTabAtLine: async (path: string, name: string, line?: number) => {
    const normalizedPath = normalizeTabPath(path)
    const { tabs } = get()
    const existing = tabs.find(
      (tab) => isFileEditorTab(tab) && pathsEqual(tab.path, normalizedPath),
    )
    if (existing) {
      set((s) => ({
        activeTabId: existing.id,
        revealLine: line ?? null,
        revealTabId: line ? existing.id : null,
        revealNonce: line ? s.revealNonce + 1 : s.revealNonce,
      }))
      return
    }

    try {
      const content = await window.api.readFile(normalizedPath)
      const id = nextTabId()
      const ext = name.split('.').pop() ?? ''
      const lang = extToLanguage(ext)
      const tab: FileEditorTab = {
        id,
        kind: 'file',
        name,
        path: normalizedPath,
        content,
        language: lang,
        isDirty: false,
      }
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: id,
        revealLine: line ?? null,
        revealTabId: line ? id : null,
        revealNonce: line ? s.revealNonce + 1 : s.revealNonce,
      }))
    } catch {
      /* file missing or unreadable */
    }
  },

  openBrowserTab: () => {
    const id = nextTabId()
    set((s) => ({
      tabs: [...s.tabs, {
        id,
        kind: 'browser',
        name: t.editorTabBrowser,
        url: 'about:blank',
        partition: `openllm-browser-${id}`,
      }],
      activeTabId: id,
    }))
  },

  openConsoleTab: (cwd: string) => {
    const id = nextTabId()
    const termId = `editor-console-${id}`
    set((s) => ({
      tabs: [...s.tabs, { id, kind: 'console', name: t.editorTabConsole, termId }],
      activeTabId: id,
    }))
    void cwd
  },

  openPowerShellTab: (cwd: string) => {
    const id = nextTabId()
    const termId = `editor-powershell-${id}`
    set((s) => ({
      tabs: [...s.tabs, { id, kind: 'powershell', name: t.editorTabPowerShell, termId }],
      activeTabId: id,
    }))
    void cwd
  },

  setBrowserTabUrl: (id: string, url: string) => {
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.kind === 'browser' && tab.id === id ? { ...tab, url } : tab,
      ),
    }))
  },

  clearRevealLine: () => set({ revealLine: null, revealTabId: null }),

  closeTab: (id: string) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.kind === 'console' || tab?.kind === 'powershell') {
      window.api.termKill(tab.termId)
    }

    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const next = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (activeTabId === id) {
        activeTabId = next[Math.min(idx, next.length - 1)]?.id ?? null
      }
      const markdownPreview = { ...s.markdownPreview }
      delete markdownPreview[id]
      return { tabs: next, activeTabId, markdownPreview }
    })
  },

  closeTabByPath: (filePath: string) => {
    const tab = get().tabs.find(
      (t) => isFileEditorTab(t) && t.path === filePath,
    )
    if (tab) get().closeTab(tab.id)
  },

  renameTabPath: (oldPath: string, newPath: string, newName: string) => {
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        isFileEditorTab(tab) && tab.path === oldPath
          ? {
              ...tab,
              path: newPath,
              name: newName,
              language: extToLanguage(newName.split('.').pop() ?? ''),
            }
          : tab,
      ),
    }))
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),

  setTabContent: (id: string, content: string) => {
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        isFileEditorTab(tab) && tab.id === id ? { ...tab, content, isDirty: true } : tab,
      ),
    }))
    const existing = _autoSaveTimers.get(id)
    if (existing) clearTimeout(existing)
    _autoSaveTimers.set(id, setTimeout(() => {
      _autoSaveTimers.delete(id)
      get().saveTab(id)
    }, 1500))
  },

  markDirty: (id: string, dirty: boolean) => {
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        isFileEditorTab(tab) && tab.id === id ? { ...tab, isDirty: dirty } : tab,
      ),
    }))
  },

  saveTab: async (id: string) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab || !isFileEditorTab(tab) || !tab.isDirty) return
    await window.api.writeFile(tab.path, tab.content ?? '')
    set((s) => ({
      tabs: s.tabs.map((t) =>
        isFileEditorTab(t) && t.id === id ? { ...t, isDirty: false } : t,
      ),
    }))
  },

  saveActiveTab: async () => {
    const { activeTabId, saveTab } = get()
    if (activeTabId) await saveTab(activeTabId)
  },

  setCursorPosition: (line, column) => set({ cursorLine: line, cursorColumn: column }),

  toggleMarkdownPreview: (id: string) => {
    set((s) => ({
      markdownPreview: {
        ...s.markdownPreview,
        [id]: !s.markdownPreview[id],
      },
    }))
  },

  isMarkdownPreview: (id: string) => Boolean(get().markdownPreview[id]),
}))

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', html: 'html', md: 'markdown',
    py: 'python', rs: 'rust', go: 'go', cs: 'csharp', cpp: 'cpp',
    c: 'c', java: 'java', sh: 'shell', bash: 'shell', yaml: 'yaml',
    yml: 'yaml', toml: 'toml', xml: 'xml', sql: 'sql', txt: 'plaintext',
  }
  return map[ext.toLowerCase()] ?? 'plaintext'
}
