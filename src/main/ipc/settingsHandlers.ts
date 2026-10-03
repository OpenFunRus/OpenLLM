import fs from 'fs'

import path from 'path'

import type { IpcMain, App } from 'electron'

import { settingsService } from '../services/SettingsService'

import type { AppSettings, ChatMessage, ChatSessionsData, ChatSession } from '../../shared/types'



const getChatHistoryPath = () => {

  const { app } = require('electron') as { app: App }

  return path.join(app.getPath('userData'), 'chat-history.json')

}



const getChatSessionsPath = (workspacePath?: string | null) => {
  const { app } = require('electron') as { app: App }
  if (workspacePath) {
    return path.join(workspacePath, '.openllm', 'chat-sessions.json')
  }
  return path.join(app.getPath('userData'), 'chat-sessions-no-workspace.json')
}

const getLegacyChatSessionsPath = () => {
  const { app } = require('electron') as { app: App }
  return path.join(app.getPath('userData'), 'chat-sessions.json')
}

function ensureWorkspaceOpenllmDir(workspacePath: string): void {
  fs.mkdirSync(path.join(workspacePath, '.openllm'), { recursive: true })
}

function readChatSessionsFile(filePath: string): ChatSessionsData | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as ChatSessionsData
    if (parsed.sessions && Array.isArray(parsed.sessions)) {
      return {
        sessions: parsed.sessions,
        activeSessionId: parsed.activeSessionId ?? null,
        closedSessions: parsed.closedSessions ?? [],
      }
    }
  } catch { /* fall through */ }
  return null
}



function titleFromMessages(messages: ChatMessage[]): string {

  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim())

  if (!firstUser) return 'Новый чат'

  const text = firstUser.content.trim().replace(/\s+/g, ' ')

  return text.length > 36 ? `${text.slice(0, 36)}…` : text

}



function migrateLegacyHistory(): ChatSessionsData {

  try {

    const raw = fs.readFileSync(getChatHistoryPath(), 'utf-8')

    const messages = JSON.parse(raw) as ChatMessage[]

    if (!Array.isArray(messages) || messages.length === 0) {

      return { sessions: [], activeSessionId: null, closedSessions: [] }

    }

    const id = '1'

    const session: ChatSession = {

      id,

      title: titleFromMessages(messages),

      messages,

      createdAt: Date.now(),

      updatedAt: Date.now(),

    }

    return { sessions: [session], activeSessionId: id, closedSessions: [] }

  } catch {

    return { sessions: [], activeSessionId: null }

  }

}



export function registerSettingsHandlers(): void {

  const { ipcMain } = require('electron') as { ipcMain: IpcMain }



  ipcMain.handle('settings:getAll', () => settingsService.getAll())



  ipcMain.handle('settings:set', (_e, key: keyof AppSettings, value: unknown) => {
    settingsService.set(key as any, value as any)
    if (key === 'agentSummarizeAtPercent') {
      settingsService.set('agentContextStopPercent', value as number)
    }
  })



  ipcMain.handle('chat:saveSessions', (_e, data: ChatSessionsData, workspacePath?: string | null) => {
    try {
      if (workspacePath) ensureWorkspaceOpenllmDir(workspacePath)
      fs.writeFileSync(getChatSessionsPath(workspacePath), JSON.stringify(data, null, 2), 'utf-8')
    } catch { /* non-fatal */ }
  })

  ipcMain.handle('chat:loadSessions', (_e, workspacePath?: string | null): ChatSessionsData => {
    const primary = readChatSessionsFile(getChatSessionsPath(workspacePath))
    if (primary) return primary

    if (!workspacePath) {
      const legacySessions = readChatSessionsFile(getLegacyChatSessionsPath())
      if (legacySessions) return legacySessions
      return migrateLegacyHistory()
    }

    return { sessions: [], activeSessionId: null, closedSessions: [] }
  })



  // Legacy API kept for compatibility

  ipcMain.handle('chat:save', (_e, messages: ChatMessage[]) => {

    try {

      fs.writeFileSync(getChatHistoryPath(), JSON.stringify(messages, null, 2), 'utf-8')

    } catch { /* non-fatal */ }

  })



  ipcMain.handle('chat:load', (): ChatMessage[] => {

    const data = migrateLegacyHistory()

    const active = data.sessions.find((s) => s.id === data.activeSessionId)

    return active?.messages ?? []

  })

}

