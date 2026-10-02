import { useState, useEffect, useRef } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useEditorStore } from '../../store/editorStore'
import type { FileNode } from '../../../../shared/types'
import { t } from '../../../../shared/i18n'
import styles from './CommandPalette.module.css'

interface Command {
  id: string
  label: string
  description?: string
  action: () => void
}

function flattenTree(nodes: FileNode[], result: FileNode[] = []): FileNode[] {
  for (const n of nodes) {
    if (!n.isDirectory) result.push(n)
    if (n.children) flattenTree(n.children, result)
  }
  return result
}

export function CommandPalette(): JSX.Element {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    setCommandPaletteOpen, toggleSidebar, toggleAiPanel,
    toggleTerminal, setModelManagerOpen
  } = useUiStore()
  const { openFolder, fileTree } = useWorkspaceStore()
  const { openTab } = useEditorStore()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const close = () => setCommandPaletteOpen(false)

  const commands: Command[] = [
    { id: 'open-folder', label: t.cmdOpenFolder, description: t.cmdOpenFolderDesc, action: () => { openFolder(); close() } },
    { id: 'toggle-sidebar', label: t.cmdToggleSidebar, action: () => { toggleSidebar(); close() } },
    { id: 'toggle-ai', label: t.cmdToggleAi, action: () => { toggleAiPanel(); close() } },
    { id: 'toggle-terminal', label: t.cmdToggleTerminal, action: () => { toggleTerminal(); close() } },
    { id: 'models', label: t.cmdModels, description: t.cmdModelsDesc, action: () => { setModelManagerOpen(true); close() } },
  ]

  const allFiles = flattenTree(fileTree)
  const fileResults = query.length >= 2
    ? allFiles.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    : []

  const cmdResults = commands.filter((c) =>
    !query || c.label.toLowerCase().includes(query.toLowerCase())
  )

  const [selectedIdx, setSelectedIdx] = useState(0)
  const totalItems = fileResults.length + cmdResults.length

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, totalItems - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIdx < fileResults.length) {
        const f = fileResults[selectedIdx]
        openTab(f.path, f.name); close()
      } else {
        cmdResults[selectedIdx - fileResults.length]?.action()
      }
    }
    if (e.key === 'Escape') close()
  }

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className={styles.inputRow}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
          />
        </div>
        <div className={styles.results}>
          {fileResults.length > 0 && (
            <>
              <div className={styles.groupLabel}>{t.filesGroup}</div>
              {fileResults.map((f, i) => (
                <div
                  key={f.path}
                  className={`${styles.item} ${i === selectedIdx ? styles.selected : ''}`}
                  onClick={() => { openTab(f.path, f.name); close() }}
                >
                  <span className={styles.itemLabel}>{f.name}</span>
                  <span className={styles.itemDesc}>{f.path}</span>
                </div>
              ))}
            </>
          )}
          {cmdResults.length > 0 && (
            <>
              <div className={styles.groupLabel}>{t.commandsGroup}</div>
              {cmdResults.map((c, i) => {
                const idx = fileResults.length + i
                return (
                  <div
                    key={c.id}
                    className={`${styles.item} ${idx === selectedIdx ? styles.selected : ''}`}
                    onClick={c.action}
                  >
                    <span className={styles.itemLabel}>{c.label}</span>
                    {c.description && <span className={styles.itemDesc}>{c.description}</span>}
                  </div>
                )
              })}
            </>
          )}
          {totalItems === 0 && (
            <div className={styles.empty}>{t.noResults(query)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
