import { create } from 'zustand'
import type { GitFileStatus, GitRepoInfo } from '@shared/types'

interface GitState {
  info: GitRepoInfo | null
  files: GitFileStatus[]
  isLoading: boolean
  commitMessage: string
  refresh: (cwd: string) => Promise<void>
  stage: (cwd: string, filePath: string) => Promise<void>
  unstage: (cwd: string, filePath: string) => Promise<void>
  stageAll: (cwd: string) => Promise<void>
  commit: (cwd: string, msg: string, name: string, email: string) => Promise<void>
  push: (cwd: string, pat?: string) => Promise<void>
  pull: (cwd: string, pat?: string) => Promise<void>
  setCommitMessage: (msg: string) => void
}

export const useGitStore = create<GitState>((set, _get) => ({
  info: null,
  files: [],
  isLoading: false,
  commitMessage: '',

  refresh: async (cwd: string) => {
    set({ isLoading: true })
    try {
      const [info, files] = await Promise.all([
        window.api.gitInfo(cwd),
        window.api.gitStatus(cwd)
      ])
      set({ info, files, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  stage: async (cwd, filePath) => {
    await window.api.gitStage(cwd, filePath)
  },

  unstage: async (cwd, filePath) => {
    await window.api.gitUnstage(cwd, filePath)
  },

  stageAll: async (cwd) => {
    await window.api.gitStageAll(cwd)
  },

  commit: async (cwd, msg, name, email) => {
    await window.api.gitCommit(cwd, msg, name, email)
    set({ commitMessage: '' })
  },

  push: async (cwd, pat) => {
    await window.api.gitPush(cwd, pat)
  },

  pull: async (cwd, pat) => {
    await window.api.gitPull(cwd, pat)
  },

  setCommitMessage: (msg) => set({ commitMessage: msg })
}))
