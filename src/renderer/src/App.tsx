import { useEffect, useCallback } from 'react'
import { ActivityBar } from './components/ActivityBar/ActivityBar'
import { TitleBar } from './components/TitleBar/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { EditorArea } from './components/Editor/EditorArea'
import { AiPanel } from './components/AiPanel/AiPanel'
import { TerminalPanel } from './components/Terminal/TerminalPanel'
import { StatusBar } from './components/StatusBar/StatusBar'
import { CommandPalette } from './components/Modals/CommandPalette'
import { ModelManagerModal } from './components/Modals/ModelManagerModal'
import { SettingsModal } from './components/Modals/SettingsModal'
import { ProjectHomeScreen } from './components/ProjectHome/ProjectHomeScreen'
import { AskQuestionModal } from './components/Modals/AskQuestionModal'
import { SwitchModeModal } from './components/Modals/SwitchModeModal'
import { ResizeHandle } from './components/Layout/ResizeHandle'
import { TooltipLayer } from './components/Layout/TooltipLayer'
import { useUiStore } from './store/uiStore'
import { useWorkspaceStore } from './store/workspaceStore'
import { useEditorStore } from './store/editorStore'
import { useAiStore } from './store/aiStore'
import styles from './App.module.css'

export function App(): JSX.Element {
  const {
    sidebarVisible, aiPanelVisible, terminalVisible,
    commandPaletteOpen, setCommandPaletteOpen,
    sidebarWidth, aiPanelWidth, terminalHeight,
    adjustSidebarWidth, adjustAiPanelWidth,
    loadLayoutFromSettings, clampAiPanelToWindow,
    toggleTerminal, toggleAiPanel,
    setEditorFontSize, setEditorTabSize
  } = useUiStore()

  const projectManagerOpen = useUiStore((s) => s.projectManagerOpen)
  const { current: workspace, refreshTree } = useWorkspaceStore()
  const showProjectHome = !workspace || projectManagerOpen
  const { saveActiveTab } = useEditorStore()
  const { setModelStatus, activeSessionId, switchWorkspaceChats } = useAiStore()

  // Sync LLM status and settings on mount
  useEffect(() => {
    window.api.getLlmStatus().then(({ isLoaded, modelName }) => {
      setModelStatus(isLoaded, modelName)
    })
    window.api.getSettings().then(async (s) => {
      setEditorFontSize(s.editorFontSize)
      setEditorTabSize(s.editorTabSize)
      loadLayoutFromSettings(s)

      await switchWorkspaceChats(null)
    })
  }, [setModelStatus, setEditorFontSize, setEditorTabSize, loadLayoutFromSettings, switchWorkspaceChats])

  useEffect(() => {
    const onResize = () => clampAiPanelToWindow()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampAiPanelToWindow])

  // File system change → refresh tree
  useEffect(() => {
    const unsub = window.api.onFsChanged(() => {
      if (workspace) refreshTree()
    })
    return unsub
  }, [workspace, refreshTree])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault()
      saveActiveTab()
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault()
      setCommandPaletteOpen(true)
    }
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault()
      toggleTerminal()
    }
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault()
      toggleAiPanel()
    }
    if (e.key === 'Escape' && commandPaletteOpen) {
      setCommandPaletteOpen(false)
    }
  }, [saveActiveTab, setCommandPaletteOpen, commandPaletteOpen, toggleTerminal, toggleAiPanel])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={styles.shell}>
      <TitleBar />
      {showProjectHome ? (
        <ProjectHomeScreen />
      ) : (
        <>
          <div className={styles.body}>
            <ActivityBar />
            {sidebarVisible && (
              <>
                <div className={styles.sidebarWrap} style={{ width: sidebarWidth }}>
                  <Sidebar />
                </div>
                <ResizeHandle orientation="vertical" onResize={adjustSidebarWidth} />
              </>
            )}
            <div className={styles.main}>
              <div className={styles.editors}>
                <EditorArea />
              </div>
              <div
                className={styles.terminal}
                style={{
                  height: terminalVisible ? terminalHeight : 0,
                  display: terminalVisible ? undefined : 'none',
                }}
              >
                <TerminalPanel
                  cwd={workspace?.path ?? ''}
                  sessionId={activeSessionId}
                />
              </div>
            </div>
            {aiPanelVisible && (
              <>
                <ResizeHandle orientation="vertical" onResize={(d) => adjustAiPanelWidth(-d)} />
                <div className={styles.aiPanelWrap} style={{ width: aiPanelWidth }}>
                  <AiPanel />
                </div>
              </>
            )}
          </div>
          <StatusBar />
        </>
      )}
      {commandPaletteOpen && <CommandPalette />}
      <ModelManagerModal />
      <SettingsModal />
      <AskQuestionModal />
      <SwitchModeModal />
      <TooltipLayer />
    </div>
  )
}
