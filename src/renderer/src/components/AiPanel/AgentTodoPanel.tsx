import type { AgentTodoItem } from '@shared/agent/types'
import { t } from '@shared/i18n'
import styles from './AgentTodoPanel.module.css'

interface AgentTodoPanelProps {
  todos: AgentTodoItem[]
  /** Hide panel header when embedded in composer context drawer. */
  embedded?: boolean
}

function statusIcon(status: AgentTodoItem['status']): string {
  switch (status) {
    case 'in_progress':
      return '→'
    case 'completed':
      return '✓'
    case 'cancelled':
      return '✕'
    default:
      return '○'
  }
}

export function AgentTodoPanel({ todos, embedded = false }: AgentTodoPanelProps): JSX.Element | null {
  const visible = todos.filter((item) => item.status !== 'cancelled')
  if (visible.length === 0) return null

  const done = visible.filter((item) => item.status === 'completed').length

  return (
    <div className={styles.panel}>
      {!embedded && (
        <div className={styles.header}>
          <span className={styles.title}>{t.agentTodosTitle}</span>
          <span className={styles.count}>{t.agentTodosProgress(done, visible.length)}</span>
        </div>
      )}
      <ul className={embedded ? `${styles.list} ${styles.listEmbedded}` : styles.list}>
        {visible.map((item) => (
          <li
            key={item.id}
            className={`${styles.item} ${styles[`status_${item.status}`] ?? ''}`}
          >
            <span className={styles.icon} aria-hidden="true">{statusIcon(item.status)}</span>
            <span className={styles.content}>{item.content}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
