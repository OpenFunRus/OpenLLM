import type { AgentToolEvent } from '@shared/agent/types'
import { t } from '@shared/i18n'
import { useEditorStore } from '../../store/editorStore'
import { fileExtensionColor, fileExtensionLabel, relativeDisplayPath } from '../../utils/lineDiff'
import { StreamBubble } from './StreamBubble'
import styles from './PlanBubble.module.css'

interface Props {
  event: AgentToolEvent
  workspacePath?: string | null
  isMessageStreaming?: boolean
  onImplement?: (filePath: string, planName?: string) => void
}

function parsePlanEvent(event: AgentToolEvent): { filePath?: string; name?: string } {
  let filePath = event.filePath
  let name: string | undefined
  if (event.result) {
    try {
      const parsed = JSON.parse(event.result) as { filePath?: string; name?: string }
      filePath = filePath ?? parsed.filePath
      name = parsed.name
    } catch { /* ignore */ }
  }
  return { filePath, name }
}

export function PlanBubble({
  event,
  workspacePath,
  isMessageStreaming = false,
  onImplement,
}: Props): JSX.Element {
  const { openTab } = useEditorStore()
  const isPending = event.status === 'pending'
  const { filePath, name } = parsePlanEvent(event)
  const displayPath = filePath ? relativeDisplayPath(filePath, workspacePath) : null
  const fileName = displayPath?.split(/[/\\]/).pop() ?? name?.trim() ?? t.planFileFallback
  const extLabel = fileExtensionLabel(fileName)
  const extColor = fileExtensionColor(extLabel.toLowerCase())

  const openPlanFile = async () => {
    if (!filePath || isPending) return
    await openTab(filePath, fileName)
  }

  const canImplement = Boolean(filePath && !isPending && !event.isError && !isMessageStreaming && onImplement)

  return (
    <StreamBubble
      title={
        <>
          <span className={styles.fileIcon} style={{ color: extColor }}>{extLabel}</span>
          {filePath && !isPending ? (
            <button type="button" className={styles.fileNameBtn} onClick={() => void openPlanFile()}>
              {fileName}
            </button>
          ) : (
            <span className={styles.fileName}>{isPending ? t.planCreating : fileName}</span>
          )}
        </>
      }
      body=""
      live={isPending && !event.isError}
      status={event.isError ? 'error' : isPending ? 'running' : 'done'}
      forceHeaderOnly
      onTitleClick={filePath && !isPending ? () => void openPlanFile() : undefined}
      headerExtra={
        <>
          {event.isError && <span className={styles.errorBadge}>{t.failed}</span>}
          {canImplement && (
            <button
              type="button"
              className={styles.implementBtn}
              onClick={(e) => {
                e.stopPropagation()
                onImplement?.(filePath!, name)
              }}
            >
              {t.planImplement}
            </button>
          )}
        </>
      }
      className={styles.planBubble}
    />
  )
}
