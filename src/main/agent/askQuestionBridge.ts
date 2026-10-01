import crypto from 'crypto'
import type { WebContents } from 'electron'
import type {
  AgentMode,
  AskQuestionAnswers,
  AskQuestionPayload,
  SwitchModePayload,
  SwitchModeResult,
} from '../../shared/agent/types'

type PendingAsk = {
  resolve: (answers: AskQuestionAnswers) => void
  reject: (err: Error) => void
}

type PendingSwitch = {
  resolve: (result: SwitchModeResult) => void
  reject: (err: Error) => void
}

type ActiveRun = {
  sender: WebContents
  pending: Map<string, PendingAsk>
  pendingSwitch: Map<string, PendingSwitch>
}

const activeRuns = new Map<string, ActiveRun>()

export function registerAgentRun(runId: string, sender: WebContents): void {
  activeRuns.set(runId, { sender, pending: new Map(), pendingSwitch: new Map() })
}

export function unregisterAgentRun(runId: string): void {
  const run = activeRuns.get(runId)
  if (run) {
    for (const pending of run.pending.values()) {
      pending.reject(new Error('Agent run ended'))
    }
    for (const pending of run.pendingSwitch.values()) {
      pending.reject(new Error('Agent run ended'))
    }
  }
  activeRuns.delete(runId)
}

export function requestAskQuestion(
  runId: string | undefined,
  payload: AskQuestionPayload
): Promise<AskQuestionAnswers> {
  if (!runId) {
    return Promise.reject(new Error('AskQuestion requires an active agent run'))
  }

  const run = activeRuns.get(runId)
  if (!run || run.sender.isDestroyed()) {
    return Promise.reject(new Error('No active agent run for AskQuestion'))
  }

  const requestId = crypto.randomUUID()

  return new Promise((resolve, reject) => {
    run.pending.set(requestId, { resolve, reject })
    run.sender.send(`agent:askQuestion:${runId}`, { runId, requestId, ...payload })
  })
}

export function submitAskQuestion(
  runId: string,
  requestId: string,
  answers: AskQuestionAnswers
): boolean {
  const run = activeRuns.get(runId)
  const pending = run?.pending.get(requestId)
  if (!pending) return false
  run!.pending.delete(requestId)
  pending.resolve(answers)
  return true
}

export function requestSwitchMode(
  runId: string | undefined,
  payload: SwitchModePayload
): Promise<SwitchModeResult> {
  if (!runId) {
    return Promise.reject(new Error('SwitchMode requires an active agent run'))
  }

  const run = activeRuns.get(runId)
  if (!run || run.sender.isDestroyed()) {
    return Promise.reject(new Error('No active agent run for SwitchMode'))
  }

  const requestId = crypto.randomUUID()

  return new Promise((resolve, reject) => {
    run.pendingSwitch.set(requestId, { resolve, reject })
    run.sender.send(`agent:switchMode:${runId}`, { runId, requestId, ...payload })
  })
}

export function submitSwitchMode(
  runId: string,
  requestId: string,
  approved: boolean,
  targetModeId: AgentMode
): boolean {
  const run = activeRuns.get(runId)
  const pending = run?.pendingSwitch.get(requestId)
  if (!pending) return false
  run!.pendingSwitch.delete(requestId)
  pending.resolve({ approved, targetModeId })
  return true
}

export type BackgroundTaskDonePayload = {
  agentId: string
  subagentType: string
  description: string
  status: 'done' | 'error'
  response?: string
  error?: string
  steps?: number
}

export function notifyBackgroundTaskDone(
  runId: string | undefined,
  payload: BackgroundTaskDonePayload
): void {
  if (!runId) return
  const run = activeRuns.get(runId)
  if (!run || run.sender.isDestroyed()) return
  run.sender.send(`agent:taskDone:${runId}`, payload)
}
