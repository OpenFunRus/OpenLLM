import { useEditorStore } from '../../store/editorStore'
import { t } from '@shared/i18n'
import { TabBar } from './TabBar'
import { MonacoEditor } from './MonacoEditor'
import { MarkdownPreview } from './MarkdownPreview'
import { WelcomeScreen } from './WelcomeScreen'
import styles from './EditorArea.module.css'

function isMarkdownTab(name: string, language: string): boolean {
  return language === 'markdown' || /\.md$/i.test(name)
}

export function EditorArea(): JSX.Element {
  const {
    tabs,
    activeTabId,
    markdownPreview,
    toggleMarkdownPreview,
  } = useEditorStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const showMarkdownPreview = Boolean(
    activeTab && isMarkdownTab(activeTab.name, activeTab.language) && markdownPreview[activeTab.id]
  )

  return (
    <div className={styles.area}>
      {tabs.length > 0 && <TabBar />}
      <div className={styles.content}>
        {activeTab ? (
          <div className={styles.editorShell}>
            {isMarkdownTab(activeTab.name, activeTab.language) && (
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={`${styles.previewToggle} ${showMarkdownPreview ? styles.previewToggleOn : ''}`}
                  onClick={() => toggleMarkdownPreview(activeTab.id)}
                  data-tooltip={t.markdownPreviewMode}
                  aria-pressed={showMarkdownPreview}
                >
                  <span className={styles.previewToggleMark} aria-hidden="true">✓</span>
                  {t.markdownPreviewMode}
                </button>
              </div>
            )}
            <div className={styles.editorBody}>
              {showMarkdownPreview ? (
                <MarkdownPreview content={activeTab.content ?? ''} />
              ) : (
                <MonacoEditor tab={activeTab} />
              )}
            </div>
          </div>
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}
