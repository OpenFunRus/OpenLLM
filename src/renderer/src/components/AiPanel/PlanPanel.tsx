import type { AgentPlanPayload } from '@shared/agent/types'
import { t } from '@shared/i18n'
import { useEditorStore } from '../../store/editorStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { relativeDisplayPath } from '../../utils/lineDiff'
import styles from './PlanPanel.module.css'

interface PlanPanelProps {
  plan: AgentPlanPayload
  onDismiss: () => void
}

export function PlanPanel({ plan, onDismiss }: PlanPanelProps): JSX.Element {
  const { openTab } = useEditorStore()
  const workspacePath = useWorkspaceStore((s) => s.current?.path ?? null)

  const openPlanFile = async () => {
    if (!plan.filePath) return
    const name = plan.filePath.split(/[/\\]/).pop() ?? plan.filePath
    await openTab(plan.filePath, name)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.title}>{plan.name?.trim() || t.planPanelTitle}</span>
          {plan.filePath && (
            <span className={styles.filePath} data-tooltip={plan.filePath}>
              {t.planSavedTo(relativeDisplayPath(plan.filePath, workspacePath))}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          {plan.filePath && (
            <button type="button" className={styles.openBtn} onClick={() => void openPlanFile()}>
              {t.planOpenFile}
            </button>
          )}
          <button type="button" className={styles.dismiss} onClick={onDismiss} data-tooltip={t.planDismiss}>
            ×
          </button>
        </div>
      </div>
      {plan.overview && <p className={styles.overview}>{plan.overview}</p>}
      <pre className={styles.body}>{plan.plan}</pre>
      {plan.todos && plan.todos.length > 0 && (
        <ul className={styles.todos}>
          {plan.todos.map((item) => (
            <li key={item.id}>
              <span className={styles.todoId}>{item.id}</span>
              {item.content}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
