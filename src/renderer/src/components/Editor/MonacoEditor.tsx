import { useRef, useCallback, useEffect, useState } from 'react'
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useEditorStore } from '../../store/editorStore'
import { useAiStore } from '../../store/aiStore'
import { useUiStore } from '../../store/uiStore'
import type { EditorTab } from '../../../../shared/types'

interface Props {
  tab: EditorTab
}

export function MonacoEditor({ tab }: Props): JSX.Element {
  const { setTabContent, saveTab, setCursorPosition, revealLine, revealTabId, revealNonce, clearRevealLine, activeTabId } = useEditorStore()
  const { isModelLoaded } = useAiStore()
  const { editorFontSize, editorTabSize } = useUiStore()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const fimDecorationsRef = useRef<string[]>([])
  const [editorReady, setEditorReady] = useState(false)

  const handleMount: OnMount = useCallback((editorInstance, monacoInstance) => {
    editorRef.current = editorInstance
    monacoRef.current = monacoInstance

    monacoInstance.editor.defineTheme('openllm-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'scrollbarSlider.background': 'rgba(0, 122, 204, 0.45)',
        'scrollbarSlider.hoverBackground': '#007ACC',
        'scrollbarSlider.activeBackground': '#1a8ad4',
      },
    })
    monacoInstance.editor.setTheme('openllm-dark')

    // FIM inline completion provider
    if (isModelLoaded) {
      registerFimProvider(editorInstance, monacoInstance)
    }

    // Ctrl+S save
    editorInstance.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
      () => saveTab(tab.id)
    )

    // Track cursor position for status bar
    editorInstance.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column)
    })

    setEditorReady(true)
  }, [tab.id, saveTab, isModelLoaded, setCursorPosition])

  useEffect(() => {
    setEditorReady(false)
  }, [tab.id])

  useEffect(() => {
    const editorInstance = editorRef.current
    if (!editorReady || !editorInstance || revealTabId !== tab.id || activeTabId !== tab.id || !revealLine) return
    editorInstance.revealLineInCenter(revealLine)
    editorInstance.setPosition({ lineNumber: revealLine, column: 1 })
    clearRevealLine()
  }, [editorReady, revealLine, revealTabId, revealNonce, activeTabId, tab.id, clearRevealLine])

  // Re-register FIM when model status changes
  useEffect(() => {
    const monaco = monacoRef.current
    const editorInstance = editorRef.current
    if (monaco && editorInstance && isModelLoaded) {
      registerFimProvider(editorInstance, monaco)
    }
  }, [isModelLoaded])

  return (
    <Editor
      height="100%"
      language={tab.language}
      value={tab.content ?? ''}
      theme="openllm-dark"
      onChange={(value) => setTabContent(tab.id, value ?? '')}
      onMount={handleMount}
      options={{
        fontFamily: 'Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace',
        fontSize: editorFontSize,
        lineHeight: Math.round(editorFontSize * 1.57),
        fontLigatures: true,
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        renderWhitespace: 'selection',
        tabSize: editorTabSize,
        wordWrap: 'off',
        padding: { top: 8 },
        scrollbar: {
          vertical: 'visible',
          horizontal: 'visible',
          verticalScrollbarSize: 4,
          horizontalScrollbarSize: 4,
          verticalSliderSize: 4,
          horizontalSliderSize: 4,
          useShadows: false,
        },
        suggest: { showWords: true },
        quickSuggestions: { other: true, comments: false, strings: false },
        acceptSuggestionOnCommitCharacter: true,
        snippetSuggestions: 'inline',
      }}
    />
  )
}

function registerFimProvider(
  editorInstance: editor.IStandaloneCodeEditor,
  monaco: Monaco
): void {
  const model = editorInstance.getModel()
  if (!model) return

  // Inline completions (ghost text) using FIM
  monaco.languages.registerInlineCompletionsProvider(model.getLanguageId(), {
    provideInlineCompletions: async (model, position) => {
      const prefix = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })
      const suffix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: model.getLineCount(),
        endColumn: model.getLineMaxColumn(model.getLineCount())
      })

      if (prefix.trimEnd().length < 10) return { items: [] }

      try {
        const completion = await window.api.fimComplete({
          prefix, suffix, maxTokens: 128
        })
        if (!completion.trim()) return { items: [] }
        return {
          items: [{
            insertText: completion,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            }
          }]
        }
      } catch {
        return { items: [] }
      }
    },
    freeInlineCompletions: () => { /* nothing to free */ }
  })
}
