import { useCallback, useEffect, useRef } from 'react'
import { renderTextWithMentions } from './mentionHighlight'
import styles from './ComposerMentionInput.module.css'

const MIN_HEIGHT = 22
const MAX_HEIGHT = 160

interface Props {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  disabled?: boolean
  placeholder?: string
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
}

export function ComposerMentionInput({
  value,
  onChange,
  onKeyDown,
  onPaste,
  disabled = false,
  placeholder,
  inputRef,
}: Props): JSX.Element {
  const localRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const textareaRef = inputRef ?? localRef

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = `${MIN_HEIGHT}px`
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
    const mirror = mirrorRef.current
    if (mirror) {
      mirror.style.height = el.style.height
    }
  }, [textareaRef])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const syncScroll = () => {
    const el = textareaRef.current
    const mirror = mirrorRef.current
    if (!el || !mirror) return
    mirror.scrollTop = el.scrollTop
  }

  return (
    <div className={styles.wrap}>
      <div ref={mirrorRef} className={styles.mirror} aria-hidden="true">
        {value ? renderTextWithMentions(value) : null}
      </div>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onScroll={syncScroll}
        disabled={disabled}
        rows={1}
        spellCheck
      />
    </div>
  )
}
