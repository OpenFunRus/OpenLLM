import { useCallback, useRef, useState } from 'react'
import { isFileEditorTab } from '@shared/types'
import { t } from '../../../../shared/i18n'
import { useEditorStore } from '../../store/editorStore'
import { EditorTabMenu } from './EditorTabMenu'
import styles from './TabBar.module.css'

interface Props {
  workspacePath: string | null
}

function tabTooltip(tab: ReturnType<typeof useEditorStore.getState>['tabs'][number]): string {
  if (isFileEditorTab(tab)) return tab.path
  return tab.name
}

function tabDirtyPrefix(tab: ReturnType<typeof useEditorStore.getState>['tabs'][number]): string {
  return isFileEditorTab(tab) && tab.isDirty ? '● ' : ''
}

export function TabBar({ workspacePath }: Props): JSX.Element {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    openBrowserTab,
    openConsoleTab,
    openPowerShellTab,
  } = useEditorStore()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)

  const cwd = workspacePath ?? ''

  const openMenu = useCallback(() => {
    const rect = menuBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuAnchor(rect)
    setMenuOpen(true)
  }, [])

  return (
    <div className={styles.bar}>
      <div className={styles.tabsScroll}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
            data-tooltip={tabTooltip(tab)}
          >
            <span className={styles.name}>{tabDirtyPrefix(tab)}{tab.name}</span>
            <button
              className={styles.close}
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              data-tooltip={t.closeTab}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          ref={menuBtnRef}
          type="button"
          className={styles.menuBtn}
          onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
          data-tooltip={t.editorTabMenuTitle}
          aria-label={t.editorTabMenuTitle}
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
      </div>
      {menuOpen && menuAnchor && (
        <EditorTabMenu
          anchorRect={menuAnchor}
          onClose={() => setMenuOpen(false)}
          onOpenBrowser={openBrowserTab}
          onOpenConsole={() => openConsoleTab(cwd)}
          onOpenPowerShell={() => openPowerShellTab(cwd)}
        />
      )}
    </div>
  )
}
