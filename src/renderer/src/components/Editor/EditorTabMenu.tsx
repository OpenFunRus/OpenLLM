import { useEffect, useRef } from 'react'
import { t } from '@shared/i18n'
import styles from './EditorTabMenu.module.css'

interface Props {
  anchorRect: DOMRect
  onClose: () => void
  onOpenBrowser: () => void
  onOpenConsole: () => void
  onOpenPowerShell: () => void
}

export function EditorTabMenu({
  anchorRect,
  onClose,
  onOpenBrowser,
  onOpenConsole,
  onOpenPowerShell,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const top = anchorRect.bottom + 4
  const right = Math.max(8, window.innerWidth - anchorRect.right)

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ top, right }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          onOpenBrowser()
          onClose()
        }}
      >
        {t.editorTabMenuOpenBrowser}
      </button>
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          onOpenConsole()
          onClose()
        }}
      >
        {t.editorTabMenuOpenConsole}
      </button>
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          onOpenPowerShell()
          onClose()
        }}
      >
        {t.editorTabMenuOpenPowerShell}
      </button>
    </div>
  )
}
