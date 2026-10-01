import { useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import styles from './EditMessageModal.module.css'

interface Props {
  initialText: string
  onSubmit: (text: string) => void
  onCancel: () => void
}

export function EditMessageModal({ initialText, onSubmit, onCancel }: Props): JSX.Element {
  const [text, setText] = useState(initialText)

  useEffect(() => {
    setText(initialText)
  }, [initialText])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const trimmed = text.trim()

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t.editMessageTitle}</span>
        </div>

        <div className={styles.body}>
          <textarea
            className={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            rows={6}
          />
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {t.rollbackConfirmCancel}
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            disabled={!trimmed}
            onClick={() => onSubmit(trimmed)}
          >
            {t.rollbackConfirmRevert}
          </button>
        </div>
      </div>
    </div>
  )
}
