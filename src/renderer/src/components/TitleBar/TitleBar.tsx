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
        data-tooltip={t.commandPaletteTitle}
      >
        <span className={styles.searchIcon}>⌕</span>
        <span className={styles.searchText}>{title}</span>
      </button>
      <div className={`${styles.controls} no-drag`}>
        <button className={styles.ctrl} onClick={() => window.api.minimize()} data-tooltip={t.minimize}>
          <span className={`codicon codicon-chrome-minimize ${styles.winIcon}`} aria-hidden="true" />
        </button>
        <button
          className={styles.ctrl}
          onClick={() => window.api.maximize()}
          data-tooltip={isMaximized ? t.restoreWindow : t.maximize}
        >
          <span
            className={`codicon ${isMaximized ? 'codicon-chrome-restore' : 'codicon-chrome-maximize'} ${styles.winIcon}`}
            aria-hidden="true"
          />
        </button>
        <button className={`${styles.ctrl} ${styles.close}`} onClick={() => window.api.close()} data-tooltip={t.close}>
          <span className={`codicon codicon-chrome-close ${styles.winIcon}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
