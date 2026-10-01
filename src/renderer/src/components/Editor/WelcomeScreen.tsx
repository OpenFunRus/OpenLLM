import { useWorkspaceStore } from '../../store/workspaceStore'
import { t } from '../../../../shared/i18n'
import styles from './WelcomeScreen.module.css'

export function WelcomeScreen(): JSX.Element {
  const { openFolder } = useWorkspaceStore()

  return (
    <div className={styles.screen}>
      <div className={styles.logo}>⬡</div>
      <h1 className={styles.name}>{t.appName}</h1>
      <p className={styles.sub}>{t.appSubtitle}</p>

      <div className={styles.actions}>
        <button className={styles.primaryBtn} onClick={() => openFolder()}>
          {t.openFolder}
        </button>
      </div>

      <div className={styles.shortcuts}>
        <div className={styles.shortcut}>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>
          <span>{t.commandPalette}</span>
        </div>
        <div className={styles.shortcut}>
          <kbd>Ctrl</kbd>+<kbd>L</kbd>
          <span>{t.toggleAiChat}</span>
        </div>
        <div className={styles.shortcut}>
          <kbd>Ctrl</kbd>+<kbd>`</kbd>
          <span>{t.toggleTerminal}</span>
        </div>
        <div className={styles.shortcut}>
          <kbd>Ctrl</kbd>+<kbd>S</kbd>
          <span>{t.saveFile}</span>
        </div>
      </div>
    </div>
  )
}
