import type { ChatMessage } from '../types'
import type { AgentToolEvent } from './types'
import { flattenToolEvents } from './agentSteps'
import { revertPlanFiles } from './rollbackImpact'

export function collectRevertibleToolEvents(messages: ChatMessage[]): AgentToolEvent[] {
  const events: AgentToolEvent[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const tools = message.agentSteps?.length
      ? flattenToolEvents(message.agentSteps)
      : message.toolEvents ?? []
    for (const tool of tools) {
      if (tool.status !== 'done' || tool.isError) continue
      if (tool.name === 'Write' || tool.name === 'StrReplace' || tool.name === 'Delete') {
        if (tool.filePath) events.push(tool)
      }
    }
  }
  return events
}

export function resolveAgentFilePath(filePath: string, workspacePath?: string | null): string | null {
  const winAbsolute = /^[a-zA-Z]:/.test(filePath)
  const unixAbsolute = filePath.startsWith('/')
  if (winAbsolute) return filePath
  if (unixAbsolute) {
    const rel = filePath.replace(/^\//, '')
    return workspacePath ? `${workspacePath}/${rel}` : null
  }
  return workspacePath ? `${workspacePath}/${filePath}` : null
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function parentDirOf(filePath: string): string | null {
  const normalized = normalizePath(filePath)
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return null
  return normalized.slice(0, idx)
}

function isWithinWorkspace(dirPath: string, workspacePath: string): boolean {
  const normWs = normalizePath(workspacePath).replace(/\/$/, '')
  const normDir = normalizePath(dirPath)
  return (
    normDir.toLowerCase() === normWs.toLowerCase()
    || normDir.toLowerCase().startsWith(`${normWs.toLowerCase()}/`)
  )
}

function collectShellCreatedDirectories(messages: ChatMessage[]): string[] {
  const dirs = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const tools = message.agentSteps?.length
      ? flattenToolEvents(message.agentSteps)
      : message.toolEvents ?? []
    for (const tool of tools) {
      if (tool.status !== 'done' || tool.isError) continue
      if (tool.name === 'Shell' && tool.directoryPath) {
        dirs.add(tool.directoryPath)
      }
    }
  }
  return [...dirs]
}

function collectParentDirsOfNewFiles(
  events: AgentToolEvent[],
  workspacePath: string | null | undefined
): string[] {
  const dirs = new Set<string>()
  if (!workspacePath) return []

  for (const event of events) {
    if (event.name !== 'Write' || event.oldContent !== '' || !event.filePath) continue
    const fullPath = resolveAgentFilePath(event.filePath, workspacePath)
    if (!fullPath) continue

    let dir = parentDirOf(fullPath)
    while (dir && isWithinWorkspace(dir, workspacePath)) {
      dirs.add(dir)
      const parent = parentDirOf(dir)
      if (!parent || parent === dir) break
      dir = parent
    }
  }
  return [...dirs]
}

function sortDirsByDepthDesc(dirs: string[]): string[] {
  return [...dirs].sort((a, b) => {
    const depthA = normalizePath(a).split('/').length
    const depthB = normalizePath(b).split('/').length
    return depthB - depthA
  })
}

async function cleanupEmptyDirectories(
  messages: ChatMessage[],
  events: AgentToolEvent[],
  workspacePath: string | null | undefined,
  removeEmptyDir?: (path: string) => Promise<boolean>
): Promise<void> {
  if (!removeEmptyDir || !workspacePath) return

  const dirs = new Set<string>()

  for (const relDir of collectShellCreatedDirectories(messages)) {
    const full = resolveAgentFilePath(relDir, workspacePath)
    if (full) dirs.add(full)
  }

  for (const dir of collectParentDirsOfNewFiles(events, workspacePath)) {
    dirs.add(dir)
  }

  for (const dir of sortDirsByDepthDesc([...dirs])) {
    await removeEmptyDir(dir).catch(() => {})
  }
}

export async function revertAgentChanges(
  messages: ChatMessage[],
  workspacePath: string | null | undefined,
  io: {
    writeFile: (path: string, content: string) => Promise<void>
    deleteFile: (path: string) => Promise<void>
    removeEmptyDir?: (path: string) => Promise<boolean>
  }
): Promise<void> {
  const events = collectRevertibleToolEvents(messages)
  await revertToolEvents(events, workspacePath, io)
  await revertPlanFiles(messages, workspacePath, io.deleteFile)
  await cleanupEmptyDirectories(messages, events, workspacePath, io.removeEmptyDir)
}

export async function revertToolEvents(
  events: AgentToolEvent[],
  workspacePath: string | null | undefined,
  io: {
    writeFile: (path: string, content: string) => Promise<void>
    deleteFile: (path: string) => Promise<void>
  }
): Promise<void> {
  for (const event of [...events].reverse()) {
    if (!event.filePath) continue
    const fullPath = resolveAgentFilePath(event.filePath, workspacePath)
    if (!fullPath) continue

    if (event.name === 'Delete') {
      if (event.oldContent != null) {
        await io.writeFile(fullPath, event.oldContent)
      }
      continue
    }

    if (event.name === 'Write' && event.oldContent === '') {
      await io.deleteFile(fullPath).catch(() => {})
      continue
    }

    if (event.oldContent != null) {
      await io.writeFile(fullPath, event.oldContent)
    }
  }
}
