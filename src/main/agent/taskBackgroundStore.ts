import type { SubagentRunResult } from './subagentRunner'

export type BackgroundTaskRecord = {
  agentId: string
  subagentType: string
  description: string
  status: 'running' | 'done' | 'error'
  result?: SubagentRunResult
  error?: string
  startedAt: number
  finishedAt?: number
}

const tasks = new Map<string, BackgroundTaskRecord>()

export function startBackgroundTask(meta: Omit<BackgroundTaskRecord, 'status' | 'startedAt'>): void {
  tasks.set(meta.agentId, {
    ...meta,
    status: 'running',
    startedAt: Date.now(),
  })
}

export function completeBackgroundTask(agentId: string, result: SubagentRunResult): BackgroundTaskRecord | null {
  const existing = tasks.get(agentId)
  if (!existing) return null
  const next: BackgroundTaskRecord = {
    ...existing,
    status: 'done',
    result,
    finishedAt: Date.now(),
  }
  tasks.set(agentId, next)
  return next
}

export function failBackgroundTask(agentId: string, error: string): BackgroundTaskRecord | null {
  const existing = tasks.get(agentId)
  if (!existing) return null
  const next: BackgroundTaskRecord = {
    ...existing,
    status: 'error',
    error,
    finishedAt: Date.now(),
  }
  tasks.set(agentId, next)
  return next
}

export function getBackgroundTask(agentId: string): BackgroundTaskRecord | undefined {
  return tasks.get(agentId)
}
