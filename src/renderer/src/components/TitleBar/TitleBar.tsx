import { useUiStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { IconClose, IconMaximize, IconMinimize } from '../icons/Icons'
import { t } from '../../../../shared/i18n'
import styles from './TitleBar.module.css'

export function TitleBar(): JSX.Element {
  const { setCommandPaletteOpen } = useUiStore()
  const { current } = useWorkspaceStore()

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
          <IconMinimize />
        </button>
        <button className={styles.ctrl} onClick={() => window.api.maximize()} title={t.maximize}>
          <IconMaximize />
        </button>
        <button className={`${styles.ctrl} ${styles.close}`} onClick={() => window.api.close()} title={t.close}>
          <IconClose />
        </button>
      </div>
    </div>
  )
}
