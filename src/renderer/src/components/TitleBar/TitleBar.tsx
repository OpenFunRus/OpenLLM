import { useEffect, useState } from 'react'
import '@vscode/codicons/dist/codicon.css'
import { useUiStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { t } from '../../../../shared/i18n'
import styles from './TitleBar.module.css'

export function TitleBar(): JSX.Element {
  const { setCommandPaletteOpen } = useUiStore()
  const { current } = useWorkspaceStore()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    void window.api.isMaximized().then(setIsMaximized)
    return window.api.onWindowMaximizeChanged(setIsMaximized)
  }, [])

  const title = current ? current.name : t.appName

  return (
    <div className={`${styles.bar} drag-region`}>
      <div className={styles.left}>
        <span className={styles.logo}>⬡</span>
      </div>
      <button
        className={`${styles.search} no-drag`}
        onClick={() => setCommandPaletteOpen(true)}
        title={t.commandPaletteTitle}
      >
        <span className={styles.searchIcon}>⌕</span>
        <span className={styles.searchText}>{title}</span>
        <span className={styles.searchHint}>Ctrl+Shift+P</span>
      </button>
      <div className={`${styles.controls} no-drag`}>
        <button className={styles.ctrl} onClick={() => window.api.minimize()} title={t.minimize}>
          <span className={`codicon codicon-chrome-minimize ${styles.winIcon}`} aria-hidden="true" />
        </button>
        <button
          className={styles.ctrl}
          onClick={() => window.api.maximize()}
          title={isMaximized ? t.restoreWindow : t.maximize}
        >
          <span
            className={`codicon ${isMaximized ? 'codicon-chrome-restore' : 'codicon-chrome-maximize'} ${styles.winIcon}`}
            aria-hidden="true"
          />
        </button>
        <button className={`${styles.ctrl} ${styles.close}`} onClick={() => window.api.close()} title={t.close}>
          <span className={`codicon codicon-chrome-close ${styles.winIcon}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
