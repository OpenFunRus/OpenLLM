import { useEffect, useState } from 'react'
import type { RollbackFileAction, RollbackImpact } from '@shared/agent/rollbackImpact'
import { t } from '@shared/i18n'
import styles from './RollbackConfirmModal.module.css'

interface Props {
  impact: RollbackImpact
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

function actionLabel(action: RollbackFileAction): string {
  switch (action) {
    case 'delete': return t.rollbackFileDelete
    case 'restore': return t.rollbackFileRestore
    default: return t.rollbackFileRevert
  }
}

export function RollbackConfirmModal({ impact, onConfirm, onCancel }: Props): JSX.Element {
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, submitting])

  const handleConfirm = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={() => { if (!submitting) onCancel() }}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t.rollbackConfirmTitle}</span>
        </div>

        <div className={styles.body}>
          <p className={styles.intro}>{t.rollbackConfirmIntro}</p>

          {impact.messagesRemoved > 0 && (
            <p className={styles.metaItem}>{t.rollbackConfirmMessages(impact.messagesRemoved)}</p>
          )}

          {impact.clearsPlan && (
            <p className={styles.metaItem}>
              {impact.planName
                ? t.rollbackConfirmPlanNamed(impact.planName)
                : t.rollbackConfirmPlan}
            </p>
          )}

          {impact.clearsTodos && (
            <p className={styles.metaItem}>{t.rollbackConfirmTodos(impact.todoCount)}</p>
          )}

          {impact.folders.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t.rollbackConfirmFolders}</h3>
              <ul className={styles.list}>
                {impact.folders.map((folder) => (
                  <li key={folder} className={styles.listItem}>{folder}</li>
                ))}
              </ul>
            </section>
          )}

          {impact.files.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t.rollbackConfirmFiles}</h3>
              <ul className={styles.list}>
                {impact.files.map((file) => (
                  <li key={file.path} className={styles.listItem}>
                    <span className={styles.actionTag}>{actionLabel(file.action)}</span>
                    <span>{file.displayPath}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            disabled={submitting}
            onClick={onCancel}
          >
            {t.rollbackConfirmCancel}
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            disabled={submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting ? t.rollbackConfirmSubmitting : t.rollbackConfirmRevert}
          </button>
        </div>
      </div>
    </div>
  )
}
