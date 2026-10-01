import { useState, useEffect } from 'react'
import type { AskQuestionAnswer, PendingAskQuestion } from '@shared/agent/types'
import { t } from '@shared/i18n'
import { useUiStore } from '../../store/uiStore'
import styles from './AskQuestionModal.module.css'

const OTHER_OPTION_ID = '__other__'

export function AskQuestionModal(): JSX.Element | null {
  const { pendingAskQuestion, clearPendingAskQuestion } = useUiStore()
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!pendingAskQuestion) {
      setSelections({})
      setOtherText({})
      setSubmitting(false)
    }
  }, [pendingAskQuestion?.requestId])

  const question = pendingAskQuestion
  if (!question) return null

  const toggleOption = (questionId: string, optionId: string, allowMultiple: boolean) => {
    setSelections((prev) => {
      const current = prev[questionId] ?? []
      if (allowMultiple) {
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
        return { ...prev, [questionId]: next }
      }
      return { ...prev, [questionId]: [optionId] }
    })
    if (optionId !== OTHER_OPTION_ID) {
      setOtherText((prev) => {
        const next = { ...prev }
        delete next[questionId]
        return next
      })
    }
  }

  const canSubmit = question.questions.every((q) => {
    const selected = selections[q.id] ?? []
    if (selected.length === 0) return false
    if (selected.includes(OTHER_OPTION_ID)) {
      return Boolean(otherText[q.id]?.trim())
    }
    return true
  })

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)

    const answers: AskQuestionAnswer[] = question.questions.map((q) => {
      const selectedOptionIds = selections[q.id] ?? []
      const usesOther = selectedOptionIds.includes(OTHER_OPTION_ID)
      return {
        questionId: q.id,
        selectedOptionIds: usesOther
          ? selectedOptionIds.filter((id) => id !== OTHER_OPTION_ID)
          : selectedOptionIds,
        ...(usesOther ? { otherText: otherText[q.id]?.trim() } : {}),
      }
    })

    try {
      const ok = await window.api.submitAskQuestion({
        runId: question.runId,
        requestId: question.requestId,
        answers: { answers },
      })
      if (ok) {
        clearPendingAskQuestion()
      } else {
        setSubmitting(false)
      }
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{question.title?.trim() || t.askQuestionTitle}</span>
        </div>

        <div className={styles.body}>
          {question.questions.map((q) => (
            <fieldset key={q.id} className={styles.fieldset}>
              <legend className={styles.prompt}>{q.prompt}</legend>
              <div className={styles.options}>
                {q.options.map((opt) => {
                  const selected = (selections[q.id] ?? []).includes(opt.id)
                  const inputType = q.allow_multiple ? 'checkbox' : 'radio'
                  return (
                    <label key={opt.id} className={`${styles.option} ${selected ? styles.optionSelected : ''}`}>
                      <input
                        type={inputType}
                        name={q.allow_multiple ? `${q.id}-${opt.id}` : q.id}
                        checked={selected}
                        onChange={() => toggleOption(q.id, opt.id, q.allow_multiple ?? false)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  )
                })}
                <label
                  className={`${styles.option} ${(selections[q.id] ?? []).includes(OTHER_OPTION_ID) ? styles.optionSelected : ''}`}
                >
                  <input
                    type={q.allow_multiple ? 'checkbox' : 'radio'}
                    name={q.allow_multiple ? `${q.id}-other` : q.id}
                    checked={(selections[q.id] ?? []).includes(OTHER_OPTION_ID)}
                    onChange={() => toggleOption(q.id, OTHER_OPTION_ID, q.allow_multiple ?? false)}
                  />
                  <span>{t.askQuestionOther}</span>
                </label>
                {(selections[q.id] ?? []).includes(OTHER_OPTION_ID) && (
                  <input
                    type="text"
                    className={styles.otherInput}
                    placeholder={t.askQuestionOtherPlaceholder}
                    value={otherText[q.id] ?? ''}
                    onChange={(e) => setOtherText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    autoFocus
                  />
                )}
              </div>
            </fieldset>
          ))}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.submitBtn}
            disabled={!canSubmit || submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? t.askQuestionSubmitting : t.askQuestionSubmit}
          </button>
        </div>
      </div>
    </div>
  )
}
