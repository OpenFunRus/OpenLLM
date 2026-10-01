import { create } from 'zustand'
import type { EditorTab } from '@shared/types'

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  cursorLine: number
  cursorColumn: number
  revealLine: number | null
  revealTabId: string | null
  markdownPreview: Record<string, boolean>
  openTab: (path: string, name: string) => Promise<void>
  openTabAtLine: (path: string, name: string, line?: number) => Promise<void>
  clearRevealLine: () => void
  closeTab: (id: string) => void
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

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  cursorLine: 1,
  cursorColumn: 1,
  revealLine: null,
  revealTabId: null,
  markdownPreview: {},

  openTab: async (path: string, name: string) => {
    await get().openTabAtLine(path, name)
  },

  openTabAtLine: async (path: string, name: string, line?: number) => {
    const { tabs } = get()
    const existing = tabs.find((t) => t.path === path)
    if (existing) {
      set({
        activeTabId: existing.id,
        revealLine: line ?? null,
        revealTabId: line ? existing.id : null,
      })
      return
    }

    const content = await window.api.readFile(path)
    const id = String(_nextId++)
    const ext = name.split('.').pop() ?? ''
    const lang = extToLanguage(ext)
    set((s) => ({
      tabs: [...s.tabs, { id, path, name, content, language: lang, isDirty: false }],
      activeTabId: id,
      revealLine: line ?? null,
      revealTabId: line ? id : null,
    }))
  },

  clearRevealLine: () => set({ revealLine: null, revealTabId: null }),

  closeTab: (id: string) => {
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

  setActiveTab: (id: string) => set({ activeTabId: id }),

  setTabContent: (id: string, content: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => t.id === id ? { ...t, content, isDirty: true } : t)
    }))
    // Auto-save after 1.5 s of inactivity
    const existing = _autoSaveTimers.get(id)
    if (existing) clearTimeout(existing)
    _autoSaveTimers.set(id, setTimeout(() => {
      _autoSaveTimers.delete(id)
      get().saveTab(id)
    }, 1500))
  },

  markDirty: (id: string, dirty: boolean) => {
    set((s) => ({
      tabs: s.tabs.map((t) => t.id === id ? { ...t, isDirty: dirty } : t)
    }))
  },

  saveTab: async (id: string) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab || !tab.isDirty) return
    await window.api.writeFile(tab.path, tab.content ?? '')
    set((s) => ({
      tabs: s.tabs.map((t) => t.id === id ? { ...t, isDirty: false } : t)
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
    yml: 'yaml', toml: 'toml', xml: 'xml', sql: 'sql', txt: 'plaintext'
  }
  return map[ext.toLowerCase()] ?? 'plaintext'
}
