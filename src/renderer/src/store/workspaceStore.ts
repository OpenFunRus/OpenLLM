import { create } from 'zustand'
import type { WorkspaceInfo, FileNode } from '@shared/types'
import { useAiStore } from './aiStore'
import { useUiStore } from './uiStore'

interface WorkspaceState {
  current: WorkspaceInfo | null
  fileTree: FileNode[]
  isLoading: boolean
  openFolder: (path?: string) => Promise<void>
  openFolderFromDialog: () => Promise<boolean>
  closeFolder: () => void
  refreshTree: () => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const activateWorkspace = async (info: WorkspaceInfo, previous: WorkspaceInfo | null) => {
    if (previous && previous.path !== info.path) {
      window.api.unwatchDir(previous.path)
    }
    const tree = await window.api.getFileTree(info.path)
    window.api.watchDir(info.path)
    await useAiStore.getState().switchWorkspaceChats(info.path)
    set({ current: info, fileTree: tree, isLoading: false })
  }

  return {
    current: null,
    fileTree: [],
    isLoading: false,

    openFolder: async (path?: string) => {
      if (!path) {
        useUiStore.getState().setProjectManagerOpen(true)
        return
      }

      set({ isLoading: true })
      try {
        const { current } = get()
        const info = await window.api.openFolder(path)
        await activateWorkspace(info, current)
        useUiStore.getState().setProjectManagerOpen(false)
      } catch {
        set({ isLoading: false })
      }
    },

    openFolderFromDialog: async () => {
      set({ isLoading: true })
      try {
        const { current } = get()
        const info = await window.api.openFolderDialog()
        if (!info) {
          set({ isLoading: false })
          return false
        }
        await activateWorkspace(info, current)
        useUiStore.getState().setProjectManagerOpen(false)
        return true
      } catch {
        set({ isLoading: false })
        return false
      }
    },

    closeFolder: () => {
      const { current } = get()
      if (current) window.api.unwatchDir(current.path)
      window.api.closeWorkspace()
      set({ current: null, fileTree: [] })
      void useAiStore.getState().switchWorkspaceChats(null)
    },

    refreshTree: async () => {
      const { current } = get()
      if (!current) return
      const tree = await window.api.getFileTree(current.path)
      set({ fileTree: tree })
    },
  }
})
