import { isFileEditorTab } from '@shared/types'
import { t } from '@shared/i18n'
import { useEditorStore } from '../../store/editorStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { TabBar } from './TabBar'
import { MonacoEditor } from './MonacoEditor'
import { MarkdownPreview } from './MarkdownPreview'
import { WelcomeScreen } from './WelcomeScreen'
import { BrowserTabView } from './BrowserTabView'
import { EmbeddedTerminalTab } from './EmbeddedTerminalTab'
import styles from './EditorArea.module.css'

function isMarkdownTab(name: string, language: string): boolean {
  return language === 'markdown' || /\.md$/i.test(name)
}

export function EditorArea(): JSX.Element {
  const workspace = useWorkspaceStore((s) => s.current)
  const {
    tabs,
    activeTabId,
    markdownPreview,
    toggleMarkdownPreview,
  } = useEditorStore()
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  const browserTabs = tabs.filter((tab) => tab.kind === 'browser')
  const terminalTabs = tabs.filter((tab) => tab.kind === 'console' || tab.kind === 'powershell')
  const fileTab = activeTab && isFileEditorTab(activeTab) ? activeTab : null
  const showMarkdownPreview = Boolean(
    fileTab && isMarkdownTab(fileTab.name, fileTab.language) && markdownPreview[fileTab.id],
  )
  const cwd = workspace?.path ?? ''

  return (
    <div className={styles.area}>
      <TabBar workspacePath={workspace?.path ?? null} />
      <div className={styles.content}>
        {browserTabs.map((browserTab) => (
          <div
            key={browserTab.id}
            className={styles.tabPane}
            hidden={browserTab.id !== activeTabId}
          >
            <BrowserTabView tab={browserTab} />
          </div>
        ))}
        {terminalTabs.map((termTab) => (
          <div
            key={termTab.id}
            className={styles.tabPane}
            hidden={termTab.id !== activeTabId}
          >
            <EmbeddedTerminalTab
              tab={termTab}
              cwd={cwd}
              active={termTab.id === activeTabId}
            />
          </div>
        ))}
        {fileTab && (
          <div className={styles.editorShell}>
            {isMarkdownTab(fileTab.name, fileTab.language) && (
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={`${styles.previewToggle} ${showMarkdownPreview ? styles.previewToggleOn : ''}`}
                  onClick={() => toggleMarkdownPreview(fileTab.id)}
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
                <MarkdownPreview content={fileTab.content ?? ''} />
              ) : (
                <MonacoEditor tab={fileTab} />
              )}
            </div>
          </div>
        )}
        {!activeTab && <WelcomeScreen />}
      </div>
    </div>
  )
}
