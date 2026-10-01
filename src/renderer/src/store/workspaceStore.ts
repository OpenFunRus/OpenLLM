import { create } from 'zustand'
import type { WorkspaceInfo, FileNode } from '@shared/types'

interface WorkspaceState {
  current: WorkspaceInfo | null
  fileTree: FileNode[]
  isLoading: boolean
  openFolder: (path?: string) => Promise<void>
  closeFolder: () => void
  refreshTree: () => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  current: null,
  fileTree: [],
  isLoading: false,

  openFolder: async (path?: string) => {
    set({ isLoading: true })
    try {
      const { current } = get()
      const info = path
        ? await window.api.openFolder(path)
        : await window.api.openFolderDialog()
      if (!info) { set({ isLoading: false }); return }
      if (current && current.path !== info.path) {
        window.api.unwatchDir(current.path)
      }
      const tree = await window.api.getFileTree(info.path)
      set({ current: info, fileTree: tree, isLoading: false })
      window.api.watchDir(info.path)
    } catch {
      set({ isLoading: false })
    }
  },

  closeFolder: () => {
    const { current } = get()
    if (current) window.api.unwatchDir(current.path)
    window.api.closeWorkspace()
    set({ current: null, fileTree: [] })
  },

  refreshTree: async () => {
    const { current } = get()
    if (!current) return
    const tree = await window.api.getFileTree(current.path)
    set({ fileTree: tree })
  }
}))
