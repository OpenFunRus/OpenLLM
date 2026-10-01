import { t } from '@shared/i18n'
import { StreamBubble } from './StreamBubble'
import styles from './ThinkingBlock.module.css'

interface Props {
  text: string
  live?: boolean
  defaultExpanded?: boolean
  startedAt?: number
  forceHeaderOnly?: boolean
}

function formatDuration(ms: number): string {
  const sec = ms / 1000
  if (sec < 10) return `${sec.toFixed(1)}с`
  return `${Math.round(sec)}с`
}

export function ThinkingBlock({
  text,
  live = false,
  defaultExpanded = false,
  startedAt,
  forceHeaderOnly = false,
}: Props): JSX.Element {
  const doneLabel =
    startedAt && !live
      ? t.thoughtFor(formatDuration(Date.now() - startedAt))
      : t.thinking

  return (
    <StreamBubble
      title={live ? t.thinkingInProgress : doneLabel}
      body={text}
      live={live}
      status={live ? 'streaming' : 'done'}
      defaultExpanded={defaultExpanded}
      forceHeaderOnly={forceHeaderOnly}
      previewLines={4}
      className={styles.thinkingBubble}
      bodyClassName={styles.thinkingBody}
    />
  )
}
