import { useEditorStore } from '../../store/editorStore'
import { useAiStore } from '../../store/aiStore'
import { useUiStore } from '../../store/uiStore'
import { t } from '../../../../shared/i18n'
import styles from './StatusBar.module.css'

export function StatusBar(): JSX.Element {
  const { tabs, activeTabId, cursorLine, cursorColumn } = useEditorStore()
  const { isModelLoaded, modelName } = useAiStore()
  const { statusMessage, toggleTerminal, toggleAiPanel, setModelManagerOpen, toggleTheme } = useUiStore()

  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {statusMessage && (
          <span className={styles.item}>{statusMessage}</span>
        )}
      </div>

      <div className={styles.right}>
        {activeTab && (
          <>
            <span className={styles.item}>{t.lineCol(cursorLine, cursorColumn)}</span>
            <span className={styles.divider} />
            <span className={styles.item}>{activeTab.language}</span>
            <span className={styles.divider} />
          </>
        )}
        <button
          className={`${styles.item} ${isModelLoaded ? styles.modelActive : ''}`}
          onClick={() => setModelManagerOpen(true)}
          title={t.modelManager}
        >
          <span className={styles.icon}>⬡</span>
          <span>{isModelLoaded && modelName ? truncate(modelName, 22) : t.noModel}</span>
        </button>
        <span className={styles.divider} />
        <button className={styles.item} onClick={toggleAiPanel} title={t.toggleAiPanel}>
          {t.ai}
        </button>
        <button className={styles.item} onClick={toggleTerminal} title={t.toggleTerminalHint}>
          ⌨
        </button>
        <button className={styles.item} onClick={toggleTheme} title={t.toggleTheme}>
          ◑
        </button>
      </div>
    </div>
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
