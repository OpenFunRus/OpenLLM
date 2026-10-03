import type { AgentToolEvent } from '@shared/agent/types'
import type { ChatMessage } from '@shared/types'
import {
  buildAgentStepsFromLegacy,
  flattenToolEvents,
} from '@shared/agent/agentSteps'
import type { ChatTurn } from './chatTurns'
import {
  computeLineDiff,
  countDiffStats,
  relativeDisplayPath,
} from '../../utils/lineDiff'

export type ComposerChangedFile = {
  filePath: string
  displayName: string
  addCount: number
  removeCount: number
  isPending: boolean
  revealLine?: number
}

type FileAccum = {
  baseline: string | null
  current: string
  isPending: boolean
  deleted: boolean
}

/** First changed line in the current file (for editor reveal). */
export function firstChangedLineInFile(oldContent: string, newContent: string): number | undefined {
  if (oldContent === newContent) return undefined
  const rows = computeLineDiff(oldContent, newContent)
  const added = rows.find((r) => r.type === 'add' && r.newLine)
  if (added?.newLine) return added.newLine
  const removed = rows.find((r) => r.type === 'remove' && r.oldLine)
  if (removed?.oldLine) {
    const newLineCount = Math.max(1, newContent.split('\n').length)
    return Math.min(removed.oldLine, newLineCount)
  }
  return undefined
}

function isSupersededToolError(event: AgentToolEvent, allTools: AgentToolEvent[]): boolean {
  if (!event.isError || !event.filePath) return false
  if (event.name !== 'Write' && event.name !== 'StrReplace') return false
  return allTools.some(
    (other) =>
      other.toolId !== event.toolId &&
      other.filePath === event.filePath &&
      other.status === 'done' &&
      !other.isError &&
      (other.name === 'Write' || other.name === 'StrReplace')
  )
}

function resolveEventContents(event: AgentToolEvent): { oldText: string; newText: string } {
  const oldText = event.oldContent ?? (event.name === 'Write' ? '' : '')
  const newText = event.newContent ?? event.streamBody ?? ''
  return { oldText, newText }
}

function accumulateFileEdit(acc: FileAccum, event: AgentToolEvent): void {
  const { oldText, newText } = resolveEventContents(event)

  if (event.name === 'Delete') {
    if (acc.baseline === null) {
      acc.baseline = event.oldContent ?? oldText
    }
    acc.current = ''
    acc.deleted = true
    acc.isPending = false
    return
  }

  if (acc.baseline === null) {
    acc.baseline = oldText
  }

  if (event.status === 'pending') {
    acc.isPending = true
    if (newText) acc.current = newText
    return
  }

  if (event.newContent !== undefined) {
    acc.current = event.newContent
  } else if (newText) {
    acc.current = newText
  }
  acc.isPending = false
}

function cumulativeStats(acc: FileAccum): Pick<ComposerChangedFile, 'addCount' | 'removeCount' | 'revealLine'> {
  const baseline = acc.baseline ?? ''
  const current = acc.current

  if (acc.deleted && !baseline && !current) {
    return { addCount: 0, removeCount: 0, revealLine: 1 }
  }

  if (acc.deleted) {
    const lines = baseline.split('\n')
    const lineCount = lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
    return {
      addCount: 0,
      removeCount: lineCount || (baseline ? 1 : 0),
      revealLine: 1,
    }
  }

  const isNewFile = !baseline && current
  const diffRows = computeLineDiff(baseline, current)
  const { addCount, removeCount } = countDiffStats(diffRows)

  if (isNewFile) {
    const lines = current.split('\n')
    return {
      addCount: lines.filter(Boolean).length || lines.length,
      removeCount: 0,
      revealLine: 1,
    }
  }

  return {
    addCount,
    removeCount,
    revealLine: firstChangedLineInFile(baseline, current),
  }
}

export function collectChangedFilesFromMessage(
  message: ChatMessage | undefined,
  workspacePath: string | null
): ComposerChangedFile[] {
  if (!message) return []

  const steps = message.agentSteps?.length
    ? message.agentSteps
    : buildAgentStepsFromLegacy(message.thinkingBlocks, message.toolEvents)
  const allTools = flattenToolEvents(steps)

  const byPath = new Map<string, FileAccum>()

  for (const event of allTools) {
    if (event.name !== 'Write' && event.name !== 'StrReplace' && event.name !== 'Delete') continue
    if (!event.filePath || event.isError || isSupersededToolError(event, allTools)) continue

    const acc = byPath.get(event.filePath) ?? {
      baseline: null,
      current: '',
      isPending: false,
      deleted: false,
    }
    accumulateFileEdit(acc, event)
    byPath.set(event.filePath, acc)
  }

  const result: ComposerChangedFile[] = []

  for (const [filePath, acc] of byPath) {
    const stats = cumulativeStats(acc)
    if (!acc.deleted && stats.addCount === 0 && stats.removeCount === 0 && !acc.isPending) {
      continue
    }

    result.push({
      filePath,
      displayName: relativeDisplayPath(filePath, workspacePath),
      addCount: stats.addCount,
      removeCount: stats.removeCount,
      isPending: acc.isPending,
      revealLine: stats.revealLine,
    })
  }

  return result
}

export function activeTurnAssistantMessage(
  turns: ChatTurn[],
  activeTurnIndex: number
): ChatMessage | undefined {
  const turn = turns[activeTurnIndex]
  if (!turn) return undefined
  for (let i = turn.replyMessages.length - 1; i >= 0; i--) {
    const msg = turn.replyMessages[i]
    if (msg.role === 'assistant') return msg
  }
  return undefined
}
