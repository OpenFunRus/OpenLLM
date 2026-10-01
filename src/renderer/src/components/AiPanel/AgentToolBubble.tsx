import type { AgentToolEvent } from '@shared/agent/types'
import { t } from '@shared/i18n'
import { useEditorStore } from '../../store/editorStore'
import { IconFolder } from '../Sidebar/ExplorerIcons'
import {
  computeLineDiff,
  countDiffStats,
  fileExtensionColor,
  fileExtensionLabel,
  relativeDisplayPath,
} from '../../utils/lineDiff'
import { FileDiffBody } from './FileDiffBody'
import { PlanBubble } from './PlanBubble'
import { StreamBubble } from './StreamBubble'
import styles from './AgentToolBubble.module.css'

interface Props {
  event: AgentToolEvent
  workspacePath?: string | null
  isMessageStreaming?: boolean
  streamFocused?: boolean
  onImplementPlan?: (filePath: string, planName?: string) => void
}

function FileTypeIcon({ filePath }: { filePath: string }): JSX.Element {
  const label = fileExtensionLabel(filePath)
  const color = fileExtensionColor(label.toLowerCase())
  return (
    <span className={styles.fileIcon} style={{ color }}>
      {label}
    </span>
  )
}

function formatTodoBody(event: AgentToolEvent): string {
  try {
    const parsed = JSON.parse(event.result) as { todos?: Array<{ content: string; status: string }> }
    if (!parsed.todos?.length) return event.streamBody ?? ''
    return parsed.todos
      .map((todo) => {
        const mark =
          todo.status === 'completed' ? '☑' : todo.status === 'cancelled' ? '☒' : todo.status === 'in_progress' ? '◐' : '☐'
        return `${mark} ${todo.content}`
      })
      .join('\n')
  } catch {
    return event.streamBody ?? event.result?.slice(0, 400) ?? ''
  }
}

function firstDiffLine(oldContent: string, newContent: string): number | undefined {
  const rows = computeLineDiff(oldContent, newContent)
  const hit = rows.find((r) => r.type === 'add' || r.type === 'remove')
  return hit?.newLine ?? hit?.oldLine
}

export function AgentToolBubble({
  event,
  workspacePath,
  isMessageStreaming = false,
  streamFocused = true,
  onImplementPlan,
}: Props): JSX.Element {
  const { openTabAtLine } = useEditorStore()

  const filePath = event.filePath ?? inferFilePath(event)
  const isPending = event.status === 'pending'
  const isFileMutation = Boolean(filePath && (event.name === 'Write' || event.name === 'StrReplace' || event.name === 'Delete'))
  const isDirectory = Boolean(event.directoryPath)

  if (event.name === 'Task') {
    return <TaskToolBubble event={event} />
  }

  if (event.name === 'CreatePlan') {
    return (
      <PlanBubble
        event={event}
        workspacePath={workspacePath}
        isMessageStreaming={isMessageStreaming}
        onImplement={onImplementPlan}
      />
    )
  }

  if (isDirectory && event.directoryPath) {
    const dirName = event.directoryPath.split(/[/\\]/).pop() ?? event.directoryPath
    return (
      <StreamBubble
        title={<><span className={styles.folderIcon}><IconFolder /></span> {t.createdFolder(dirName)}</>}
        body=""
        status="done"
      />
    )
  }

  if (isFileMutation && filePath) {
    const displayName = relativeDisplayPath(filePath, workspacePath)
    const oldContent = event.oldContent ?? ''
    const newContent = event.newContent ?? inferPendingContent(event)
    const isNewFile = event.name === 'Write' && !oldContent
    const diffRows = computeLineDiff(oldContent, newContent)
    const { addCount, removeCount } = countDiffStats(diffRows)
    const addDisplay = isNewFile ? newContent.split('\n').filter(Boolean).length || newContent.split('\n').length : addCount
    const removeDisplay = isNewFile ? 0 : removeCount

    const canOpen = event.name !== 'Delete' && !event.isError && !isPending

    const openFile = async () => {
      if (!canOpen) return
      const name = filePath.split(/[/\\]/).pop() ?? displayName
      const revealLine = event.name === 'StrReplace' ? firstDiffLine(oldContent, newContent) : 1
      await openTabAtLine(filePath, name, revealLine)
    }

    return (
      <StreamBubble
        title={
          <>
            <FileTypeIcon filePath={filePath} />
            {canOpen ? (
              <button type="button" className={styles.fileNameBtn} onClick={() => void openFile()}>
                {displayName}
              </button>
            ) : (
              <span className={styles.fileName}>{displayName}</span>
            )}
          </>
        }
        live={isPending && !event.isError && streamFocused}
        status={event.isError ? 'error' : isPending ? 'running' : 'done'}
        pinPreview={!isMessageStreaming}
        forceHeaderOnly={isMessageStreaming && !streamFocused}
        bodyNode={(expanded) => (
          <FileDiffBody
            oldContent={oldContent}
            newContent={newContent}
            expanded={expanded}
            live={isPending && !event.isError && streamFocused}
          />
        )}
        headerExtra={
          <span className={styles.stats}>
            {addDisplay > 0 && <span className={styles.added}>+{addDisplay}</span>}
            {removeDisplay > 0 && <span className={styles.removed}>-{removeDisplay}</span>}
            {event.isError && <span className={styles.errorBadge}>{t.failed}</span>}
          </span>
        }
        className={styles.toolBubble}
        bodyClassName={styles.diffBody}
      />
    )
  }

  if (event.name === 'TodoWrite') {
    const body = isPending ? (event.streamBody ?? '') : formatTodoBody(event)
    return (
      <StreamBubble
        title={t.todoBubbleTitle}
        body={body}
        live={isPending}
        status={event.isError ? 'error' : isPending ? 'running' : 'done'}
        className={styles.toolBubble}
      />
    )
  }

  return <GenericToolBubble event={event} workspacePath={workspacePath} />
}

function TaskToolBubble({ event }: { event: AgentToolEvent }): JSX.Element {
  const isPending = event.status === 'pending'
  const description =
    typeof event.arguments.description === 'string' ? event.arguments.description : 'Task'
  const subagentType =
    typeof event.arguments.subagent_type === 'string' ? event.arguments.subagent_type : 'generalPurpose'

  let parsed: { status?: string; response?: string } | null = null
  if (!isPending && event.result) {
    try {
      parsed = JSON.parse(event.result) as { status?: string; response?: string }
    } catch {
      parsed = null
    }
  }

  const isRunning = parsed?.status === 'running' || (isPending && !event.isError)
  const body =
    event.streamBody ??
    parsed?.response ??
    (isRunning ? description : event.result?.slice(0, 500) ?? '')

  return (
    <StreamBubble
      title={`${t.taskSubagentTitle(description)} · ${t.taskSubagentType(subagentType)}`}
      body={body}
      live={isRunning}
      status={event.isError ? 'error' : isRunning ? 'running' : 'done'}
      className={styles.toolBubble}
    />
  )
}

function GenericToolBubble({ event, workspacePath }: Props): JSX.Element {
  const isPending = event.status === 'pending'
  const summary = toolSummary(event, workspacePath)
  const body =
    event.streamBody ??
    (event.status === 'done' && event.result ? event.result : '')

  return (
    <StreamBubble
      title={summary}
      body={body}
      live={isPending && !event.isError}
      status={event.isError ? 'error' : isPending ? 'running' : 'done'}
      headerExtra={event.isError ? <span className={styles.errorBadge}>{t.failed}</span> : undefined}
      className={styles.toolBubble}
    />
  )
}

function inferFilePath(event: AgentToolEvent): string | undefined {
  const pathArg = event.arguments.path
  if (typeof pathArg === 'string' && pathArg.trim()) return pathArg
  return undefined
}

function inferPendingContent(event: AgentToolEvent): string {
  if (typeof event.arguments.contents === 'string') return event.arguments.contents
  if (typeof event.arguments.new_string === 'string') return event.arguments.new_string
  return ''
}

function toolSummary(event: AgentToolEvent, workspacePath?: string | null): string {
  const pathArg = event.arguments.path
  if (typeof pathArg === 'string' && pathArg.trim()) {
    const display = relativeDisplayPath(pathArg, workspacePath)
    return `${event.name} ${display}`
  }
  if (event.name === 'Shell' && typeof event.arguments.command === 'string') {
    const cmd = event.arguments.command.trim()
    return cmd.length > 60 ? `Shell ${cmd.slice(0, 60)}…` : `Shell ${cmd}`
  }
  if (event.name === 'Grep' && typeof event.arguments.pattern === 'string') {
    return `Grep "${event.arguments.pattern}"`
  }
  if (event.name === 'Glob' && typeof event.arguments.glob_pattern === 'string') {
    return `Glob ${event.arguments.glob_pattern}`
  }
  if (event.name === 'Read' && typeof event.arguments.path === 'string') {
    return `Read ${relativeDisplayPath(event.arguments.path, workspacePath)}`
  }
  return event.name
}
