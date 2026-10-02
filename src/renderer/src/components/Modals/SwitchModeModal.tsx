import { useCallback, useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import { useAiStore } from '../../store/aiStore'
import { useUiStore } from '../../store/uiStore'
import styles from './SwitchModeModal.module.css'

function modeLabel(mode: string): string {
  switch (mode) {
    case 'agent': return t.agentMode
    case 'plan': return t.planMode
    case 'chat': return t.chatMode
    default: return mode
  }
}

export function SwitchModeModal(): JSX.Element | null {
  const { setComposerMode } = useAiStore()
  const { pendingSwitchMode, clearPendingSwitchMode } = useUiStore()
  const [submitting, setSubmitting] = useState(false)

  const request = pendingSwitchMode

  useEffect(() => {
    setSubmitting(false)
  }, [pendingSwitchMode?.requestId])

  const respond = useCallback(async (approved: boolean) => {
    if (!pendingSwitchMode || submitting) return
    setSubmitting(true)
    try {
      const ok = await window.api.submitSwitchMode({
        runId: pendingSwitchMode.runId,
        requestId: pendingSwitchMode.requestId,
        approved,
        targetModeId: pendingSwitchMode.targetModeId,
      })
      if (ok) {
        if (approved) {
          setComposerMode(pendingSwitchMode.targetModeId)
        }
        clearPendingSwitchMode()
      } else {
        // Run already ended or request expired — don't trap the user behind the overlay.
        clearPendingSwitchMode()
        setSubmitting(false)
      }
    } catch {
      clearPendingSwitchMode()
      setSubmitting(false)
    }
  }, [pendingSwitchMode, submitting, clearPendingSwitchMode, setComposerMode])

  useEffect(() => {
    if (!request) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void respond(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [request, respond])

  if (!request) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t.switchModeTitle}</span>
        </div>

        <div className={styles.body}>
          <div className={styles.modeBadge}>{modeLabel(request.targetModeId)}</div>
          <p>{request.explanation?.trim() || t.switchModeDefaultReason}</p>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.declineBtn}
            disabled={submitting}
            onClick={() => void respond(false)}
          >
            {t.switchModeDecline}
          </button>
          <button
            type="button"
            className={styles.acceptBtn}
            disabled={submitting}
            onClick={() => void respond(true)}
          >
            {submitting ? t.switchModeSubmitting : t.switchModeAccept}
          </button>
        </div>
      </div>
    </div>
  )
}
