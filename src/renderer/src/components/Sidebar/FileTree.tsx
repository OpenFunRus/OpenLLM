import { useState, useCallback, useEffect } from 'react'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useEditorStore } from '../../store/editorStore'
import type { FileNode } from '../../../../shared/types'
import { t } from '../../../../shared/i18n'
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFile,
  IconNewFile,
  IconNewFolder,
  IconRefresh,
  IconCollapseAll,
} from './ExplorerIcons'
import styles from './FileTree.module.css'

const INDENT = 12

function TreeNode({
  node,
  depth,
  onOpen,
  selectedPath,
  collapseKey,
}: {
  node: FileNode
  depth: number
  onOpen: (node: FileNode) => void
  selectedPath: string | null
  collapseKey: number
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const isSelected = !node.isDirectory && node.path === selectedPath

  useEffect(() => {
    setExpanded(false)
  }, [collapseKey])

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded((v) => !v)
  }

  const handleRowClick = () => {
    if (node.isDirectory) {
      setExpanded((v) => !v)
    } else {
      onOpen(node)
    }
  }

  const paddingLeft = 8 + depth * INDENT

  return (
    <div>
      <div
        className={`${styles.row} ${isSelected ? styles.selected : ''}`}
        style={{ paddingLeft }}
        onClick={handleRowClick}
        title={node.path}
      >
        <span className={styles.twistie} onClick={node.isDirectory ? toggleExpand : undefined}>
          {node.isDirectory ? (
            expanded ? <IconChevronDown /> : <IconChevronRight />
          ) : null}
        </span>
        <span className={styles.nodeIcon}>
          {node.isDirectory ? <IconFolder /> : <IconFile />}
        </span>
        <span className={styles.label}>{node.name}</span>
      </div>
      {node.isDirectory && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onOpen={onOpen}
              selectedPath={selectedPath}
              collapseKey={collapseKey}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree(): JSX.Element {
  const { current, fileTree, openFolder, refreshTree } = useWorkspaceStore()
  const { openTab, tabs, activeTabId } = useEditorStore()
  const [collapseKey, setCollapseKey] = useState(0)

  const selectedPath = tabs.find((tab) => tab.id === activeTabId)?.path ?? null

  const handleOpen = useCallback((node: FileNode) => {
    openTab(node.path, node.name)
  }, [openTab])

  const handleNewFile = async () => {
    if (!current) return
    const name = window.prompt(t.newFilePrompt)
    if (!name?.trim()) return
    await window.api.createFile(`${current.path}/${name.trim()}`)
    await refreshTree()
  }

  const handleNewFolder = async () => {
    if (!current) return
    const name = window.prompt(t.newFolderPrompt)
    if (!name?.trim()) return
    await window.api.createDirectory(`${current.path}/${name.trim()}`)
    await refreshTree()
  }

  return (
    <div className={styles.tree}>
      <div className={styles.header}>
        <span className={styles.projectTitle}>
          {current ? current.name.toUpperCase() : t.explorerHeader}
        </span>
        {current && (
          <div className={styles.toolbar}>
            <button className={styles.toolBtn} onClick={() => void handleNewFile()} title={t.newFile}>
              <IconNewFile />
            </button>
            <button className={styles.toolBtn} onClick={() => void handleNewFolder()} title={t.newFolder}>
              <IconNewFolder />
            </button>
            <button className={styles.toolBtn} onClick={() => refreshTree()} title={t.refresh}>
              <IconRefresh />
            </button>
            <button
              className={styles.toolBtn}
              onClick={() => setCollapseKey((k) => k + 1)}
              title={t.collapseAll}
            >
              <IconCollapseAll />
            </button>
          </div>
        )}
      </div>

      <div className={styles.content}>
        {!current ? (
          <div className={styles.empty}>
            <p>{t.noFolderOpen}</p>
            <button className={styles.openBtn} onClick={() => openFolder()}>
              {t.openFolder}
            </button>
          </div>
        ) : (
          fileTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              onOpen={handleOpen}
              selectedPath={selectedPath}
              collapseKey={collapseKey}
            />
          ))
        )}
      </div>
    </div>
  )
}
