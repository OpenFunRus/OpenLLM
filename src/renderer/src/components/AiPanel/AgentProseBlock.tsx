import styles from './ChatMessage.module.css'
import { renderMessageContent } from './messageContent'

interface Props {
  text: string
  live?: boolean
  workspacePath?: string | null
}

export function AgentProseBlock({ text, live = false, workspacePath }: Props): JSX.Element | null {
  const trimmed = text.trim()
  if (!trimmed && !live) return null

  return (
    <div className={`${styles.agentProse} ${live ? styles.agentProseLive : ''}`}>
      {trimmed
        ? renderMessageContent(trimmed, false, () => {}, () => {}, {}, {}, workspacePath ?? undefined)
        : live && <span className={styles.cursor}>▋</span>}
      {live && trimmed && <span className={styles.cursor}>▋</span>}
    </div>
  )
}
