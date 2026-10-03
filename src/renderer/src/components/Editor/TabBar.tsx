import { useEditorStore } from '../../store/editorStore'
import { t } from '../../../../shared/i18n'
import styles from './TabBar.module.css'

export function TabBar(): JSX.Element {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore()

  return (
    <div className={styles.bar}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ''}`}
          onClick={() => setActiveTab(tab.id)}
          data-tooltip={tab.path}
        >
          <span className={styles.name}>{tab.isDirty ? '● ' : ''}{tab.name}</span>
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
  )
}
