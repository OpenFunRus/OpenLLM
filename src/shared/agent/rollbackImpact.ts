import type { ChatMessage } from '../types'
import type { AgentToolEvent } from './types'
import { collectRevertibleToolEvents, resolveAgentFilePath } from './chatRollback'
import { flattenToolEvents } from './agentSteps'

export type RollbackFileAction = 'revert' | 'delete' | 'restore'

export type RollbackFileImpact = {
  path: string
  displayPath: string
  action: RollbackFileAction
}

export type RollbackImpact = {
  files: RollbackFileImpact[]
  folders: string[]
  messagesRemoved: number
  clearsPlan: boolean
  clearsTodos: boolean
  todoCount: number
  planName?: string
}

export type RollbackScope = 'rollback' | 'edit_resend'

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function parentDir(filePath: string): string | null {
  const normalized = normalizePath(filePath)
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return null
  return normalized.slice(0, idx)
}

export function toDisplayPath(filePath: string, workspacePath?: string | null): string {
  if (!workspacePath) return filePath
  const normWs = normalizePath(workspacePath).replace(/\/$/, '')
  const normPath = normalizePath(filePath)
  const prefix = `${normWs}/`
  if (normPath.toLowerCase().startsWith(prefix.toLowerCase())) {
    return normPath.slice(prefix.length)
  }
  return filePath
}

function describeFileRevertAction(event: AgentToolEvent): RollbackFileAction {
  if (event.name === 'Delete') return 'restore'
  if (event.name === 'Write' && event.oldContent === '') return 'delete'
  return 'revert'
}

function collectAssistantToolEvents(messages: ChatMessage[]): AgentToolEvent[] {
  const events: AgentToolEvent[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const tools = message.agentSteps?.length
      ? flattenToolEvents(message.agentSteps)
      : message.toolEvents ?? []
    events.push(...tools)
  }
  return events
}

export function collectPlanFilePaths(messages: ChatMessage[]): string[] {
  const paths = new Set<string>()
  for (const tool of collectAssistantToolEvents(messages)) {
    if (tool.name !== 'CreatePlan' || tool.status !== 'done' || tool.isError) continue
    if (tool.filePath) paths.add(tool.filePath)
    if (tool.result) {
      try {
        const parsed = JSON.parse(tool.result) as { filePath?: string }
        if (parsed.filePath) paths.add(parsed.filePath)
      } catch { /* ignore */ }
    }
  }
  return [...paths]
}

function buildFileImpacts(
  events: AgentToolEvent[],
  planFiles: string[],
  workspacePath?: string | null
): RollbackFileImpact[] {
  const byPath = new Map<string, RollbackFileAction>()

  for (const event of events) {
    if (!event.filePath) continue
    byPath.set(event.filePath, describeFileRevertAction(event))
  }

  for (const planPath of planFiles) {
    byPath.set(planPath, 'delete')
  }

  return [...byPath.entries()].map(([path, action]) => {
    const fullPath = resolveAgentFilePath(path, workspacePath) ?? path
    return {
      path: fullPath,
      displayPath: toDisplayPath(fullPath, workspacePath),
      action,
    }
  }).sort((a, b) => a.displayPath.localeCompare(b.displayPath))
}

function collectFolders(files: RollbackFileImpact[]): string[] {
  const folders = new Set<string>()
  for (const file of files) {
    const dir = parentDir(file.displayPath)
    if (dir) folders.add(dir)
  }
  return [...folders].sort((a, b) => a.localeCompare(b))
}

export function analyzeRollbackImpact(
  messages: ChatMessage[],
  messageIndex: number,
  scope: RollbackScope,
  options: {
    workspacePath?: string | null
    hasActivePlan?: boolean
    todoCount?: number
    planName?: string
  } = {}
): RollbackImpact {
  const removed =
    scope === 'rollback'
      ? messages.slice(messageIndex)
      : messages.slice(messageIndex + 1)

  const events = collectRevertibleToolEvents(removed)
  const planFiles = collectPlanFilePaths(removed)
  const files = buildFileImpacts(events, planFiles, options.workspacePath)

  const clearsSessionState = removed.some((m) => m.role === 'assistant')

  return {
    files,
    folders: collectFolders(files),
    messagesRemoved: removed.length,
    clearsPlan: Boolean(options.hasActivePlan && clearsSessionState),
    clearsTodos: Boolean((options.todoCount ?? 0) > 0 && clearsSessionState),
    todoCount: options.todoCount ?? 0,
    planName: options.planName,
  }
}

export function rollbackImpactHasChanges(impact: RollbackImpact): boolean {
  return (
    impact.files.length > 0
    || impact.messagesRemoved > 0
    || impact.clearsPlan
    || impact.clearsTodos
  )
}

export async function revertPlanFiles(
  messages: ChatMessage[],
  workspacePath: string | null | undefined,
  deleteFile: (path: string) => Promise<void>
): Promise<void> {
  for (const planPath of collectPlanFilePaths(messages)) {
    const fullPath = resolveAgentFilePath(planPath, workspacePath)
    if (!fullPath) continue
    await deleteFile(fullPath).catch(() => {})
  }
}
