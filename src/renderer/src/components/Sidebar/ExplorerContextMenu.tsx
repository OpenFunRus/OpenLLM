import { useEffect, useRef } from 'react'
import { t } from '@shared/i18n'
import styles from './ExplorerContextMenu.module.css'

export type ExplorerContextMenuState =
  | { x: number; y: number; kind: 'empty' }
  | { x: number; y: number; kind: 'node'; path: string; isDirectory: boolean }

type Props = {
  menu: ExplorerContextMenuState
  canPaste: boolean
  onClose: () => void
  onNewFile: () => void
  onNewFolder: () => void
  onCollapseAll: () => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onRename: () => void
  onCopyPath: () => void
  onOpenProjectFolder: () => void
  onDelete: () => void
}

export function ExplorerContextMenu({
  menu,
  canPaste,
  onClose,
  onNewFile,
  onNewFolder,
  onCollapseAll,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onCopyPath,
  onOpenProjectFolder,
  onDelete,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const isNode = menu.kind === 'node'

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

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" className={styles.item} onClick={onNewFile}>
        {t.newFile}
      </button>
      <button type="button" className={styles.item} onClick={onNewFolder}>
        {t.newFolder}
      </button>
      <button type="button" className={styles.item} onClick={onCollapseAll}>
        {t.collapseAll}
      </button>
      <div className={styles.separator} />
      {isNode && (
        <>
          <button type="button" className={styles.item} onClick={onCopy}>
            {t.explorerCopy}
          </button>
          <button type="button" className={styles.item} onClick={onCut}>
            {t.explorerCut}
          </button>
        </>
      )}
      <button type="button" className={styles.item} onClick={onPaste} disabled={!canPaste}>
        {t.explorerPaste}
      </button>
      {isNode && (
        <>
          <div className={styles.separator} />
          <button type="button" className={styles.item} onClick={onRename}>
            {t.explorerRename}
          </button>
        </>
      )}
      <button type="button" className={styles.item} onClick={onCopyPath}>
        {t.explorerCopyPath}
      </button>
      <button type="button" className={styles.item} onClick={onOpenProjectFolder}>
        {t.openProjectFolder}
      </button>
      {isNode && (
        <>
          <div className={styles.separator} />
          <button type="button" className={styles.item} onClick={onDelete}>
            {t.explorerDelete}
          </button>
        </>
      )}
    </div>
  )
}
