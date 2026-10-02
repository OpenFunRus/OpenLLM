import { useState, useCallback, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useEditorStore } from '../../store/editorStore'
import type { FileNode } from '../../../../shared/types'
import { t } from '../../../../shared/i18n'
import {
  OPENLLM_EXPLORER_DRAG_MIME,
  OPENLLM_FILE_DRAG_MIME,
} from '../../../../shared/attachmentUtils'
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFile,
  IconNewFile,
  IconNewFolder,
  IconCollapseAll,
  IconOpenInExplorer,
} from './ExplorerIcons'
import {
  ExplorerContextMenu,
  type ExplorerContextMenuState,
} from './ExplorerContextMenu'
import {
  ancestorPaths,
  findNodeByPath,
  flattenVisibleNodes,
  getSiblingNames,
  isValidFileName,
  pathBasename,
  pathDirname,
  pathJoin,
  canMoveExplorerEntry,
  isExternalOsFileDrag,
  isInternalExplorerDrag,
  isPathWithin,
  normalizeExplorerPath,
  readDroppedOsPaths,
  resolveCreateParentDir,
  resolveExplorerDropDir,
  uniqueName,
} from './explorerPathUtils'
import styles from './FileTree.module.css'

const INDENT = 12

type ExplorerClipboard = {
  op: 'copy' | 'cut'
  paths: string[]
}

type RenameState = {
  path: string
  originalName: string
  isNew: boolean
  isDirectory: boolean
}

const ROOT_DROP_TARGET = '__root__'

type TreeNodeProps = {
  node: FileNode
  depth: number
  selectedPath: string | null
  expandedPaths: Set<string>
  renameState: RenameState | null
  dropHoverPath: string | null
  internalDragPath: string | null
  onSelect: (node: FileNode) => void
  onOpen: (node: FileNode) => void
  onToggleExpand: (path: string) => void
  onContextMenu: (event: React.MouseEvent, node: FileNode) => void
  onRenameConfirm: (path: string, nextName: string) => void
  onRenameCancel: (path: string) => void
  onNodeDragStart: (node: FileNode, event: React.DragEvent) => void
  onNodeDragEnd: () => void
  onNodeDragOver: (node: FileNode, event: React.DragEvent) => void
  onNodeDragLeave: (node: FileNode, event: React.DragEvent) => void
  onNodeDrop: (node: FileNode, event: React.DragEvent) => void
}

function InlineRenameInput({
  value,
  onConfirm,
  onCancel,
}: {
  value: string
  onConfirm: (nextName: string) => void
  onCancel: () => void
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  const commit = () => {
    onConfirm(inputRef.current?.value ?? value)
  }

  return (
    <input
      ref={inputRef}
      className={styles.renameInput}
      defaultValue={value}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      onBlur={() => commit()}
    />
  )
}

function TreeNode({
  node,
  depth,
  selectedPath,
  expandedPaths,
  renameState,
  onSelect,
  onOpen,
  onToggleExpand,
  onContextMenu,
  onRenameConfirm,
  onRenameCancel,
  dropHoverPath,
  internalDragPath,
  onNodeDragStart,
  onNodeDragEnd,
  onNodeDragOver,
  onNodeDragLeave,
  onNodeDrop,
}: TreeNodeProps): JSX.Element {
  const expanded = expandedPaths.has(node.path)
  const isSelected = node.path === selectedPath
  const isRenaming = renameState?.path === node.path
  const isDropTarget = dropHoverPath === node.path
  const isDragging = internalDragPath === node.path
  const paddingLeft = 8 + depth * INDENT

  const handleRowClick = () => {
    onSelect(node)
  }

  const handleRowDoubleClick = () => {
    if (node.isDirectory) onToggleExpand(node.path)
    else onOpen(node)
  }

  return (
    <div>
      <div
        className={`${styles.row} ${isSelected ? styles.selected : ''} ${isDropTarget ? styles.dropTarget : ''} ${isDragging ? styles.dragging : ''}`}
        style={{ paddingLeft }}
        draggable={!isRenaming}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onContextMenu={(event) => onContextMenu(event, node)}
        onDragStart={(event) => onNodeDragStart(node, event)}
        onDragEnd={onNodeDragEnd}
        onDragOver={(event) => onNodeDragOver(node, event)}
        onDragLeave={(event) => onNodeDragLeave(node, event)}
        onDrop={(event) => onNodeDrop(node, event)}
        title={node.path}
      >
        <span
          className={styles.twistie}
          onClick={(event) => {
            event.stopPropagation()
            if (node.isDirectory) onToggleExpand(node.path)
          }}
        >
          {node.isDirectory ? (
            expanded ? <IconChevronDown /> : <IconChevronRight />
          ) : null}
        </span>
        <span className={styles.nodeIcon}>
          {node.isDirectory ? <IconFolder /> : <IconFile />}
        </span>
        {isRenaming ? (
          <InlineRenameInput
            value={pathBasename(node.path)}
            onConfirm={(nextName) => onRenameConfirm(node.path, nextName)}
            onCancel={() => onRenameCancel(node.path)}
          />
        ) : (
          <span className={styles.label}>{node.name}</span>
        )}
      </div>
      {node.isDirectory && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              renameState={renameState}
              onSelect={onSelect}
              onOpen={onOpen}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
              dropHoverPath={dropHoverPath}
              internalDragPath={internalDragPath}
              onNodeDragStart={onNodeDragStart}
              onNodeDragEnd={onNodeDragEnd}
              onNodeDragOver={onNodeDragOver}
              onNodeDragLeave={onNodeDragLeave}
              onNodeDrop={onNodeDrop}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree(): JSX.Element {
  const { current, fileTree, openFolder, refreshTree } = useWorkspaceStore()
  const { openTab, closeTabByPath, renameTabPath } = useEditorStore()

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedIsDirectory, setSelectedIsDirectory] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
  const [renameState, setRenameState] = useState<RenameState | null>(null)
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenuState | null>(null)
  const [clipboard, setClipboard] = useState<ExplorerClipboard | null>(null)
  const [dropHoverPath, setDropHoverPath] = useState<string | null>(null)
  const [internalDragPath, setInternalDragPath] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const explorerActiveRef = useRef(false)
  const explorerStateRef = useRef({
    selectedPath,
    selectedIsDirectory,
    clipboard,
    renameState,
    contextMenu,
    current,
  })
  explorerStateRef.current = {
    selectedPath,
    selectedIsDirectory,
    clipboard,
    renameState,
    contextMenu,
    current,
  }

  const clearSelection = useCallback(() => {
    setSelectedPath(null)
    setSelectedIsDirectory(false)
  }, [])

  useEffect(() => {
    setSelectedPath(null)
    setSelectedIsDirectory(false)
    setExpandedPaths(new Set())
    setRenameState(null)
    setContextMenu(null)
    setClipboard(null)
  }, [current?.path])

  const expandAncestors = useCallback((dirPath: string) => {
    if (!current) return
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      for (const path of ancestorPaths(dirPath, current.path)) next.add(path)
      return next
    })
  }, [current])

  const handleOpen = useCallback((node: FileNode) => {
    openTab(node.path, node.name)
  }, [openTab])

  const handleSelect = useCallback((node: FileNode) => {
    setSelectedPath(node.path)
    setSelectedIsDirectory(node.isDirectory)
  }, [])

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const beginRename = useCallback((path: string, isNew: boolean, isDirectory: boolean) => {
    setRenameState({
      path,
      originalName: pathBasename(path),
      isNew,
      isDirectory,
    })
    expandAncestors(pathDirname(path))
  }, [expandAncestors])

  const finishRename = useCallback(async (path: string, nextName: string) => {
    const state = renameState
    setRenameState(null)

    const trimmed = nextName.trim()
    const parentDir = pathDirname(path)
    const originalName = pathBasename(path)

    if (!state) return

    if (!trimmed) {
      if (state.isNew) {
        await window.api.deleteFile(path).catch(() => {})
        await refreshTree()
      }
      return
    }

    if (trimmed === originalName) {
      if (!state.isDirectory && state.isNew) await openTab(path, trimmed)
      return
    }

    if (!isValidFileName(trimmed)) {
      window.alert(t.explorerInvalidName)
      setRenameState(state)
      return
    }

    const siblings = getSiblingNames(fileTree, parentDir, current!.path)
      .filter((name) => name !== originalName)
    if (siblings.includes(trimmed)) {
      window.alert(t.explorerNameExists)
      setRenameState(state)
      return
    }

    const nextPath = pathJoin(parentDir, trimmed)
    try {
      await window.api.renameFile(path, nextPath)
      if (!state.isDirectory) renameTabPath(path, nextPath, trimmed)
      setSelectedPath(nextPath)
      setSelectedIsDirectory(state.isDirectory)
      await refreshTree()
      if (!state.isDirectory) await openTab(nextPath, trimmed)
    } catch {
      setRenameState(state)
    }
  }, [renameState, fileTree, current, refreshTree, renameTabPath, openTab])

  const cancelRename = useCallback(async (path: string) => {
    const state = renameState
    setRenameState(null)
    if (state?.isNew) {
      await window.api.deleteFile(path).catch(() => {})
      await refreshTree()
    }
  }, [renameState, refreshTree])

  const createEntry = useCallback(async (kind: 'file' | 'folder', forceParentDir?: string) => {
    if (!current || renameState) return

    const parentDir = forceParentDir
      ?? resolveCreateParentDir(current.path, selectedPath, selectedIsDirectory)
    const siblings = getSiblingNames(fileTree, parentDir, current.path)
    const defaultName = kind === 'folder'
      ? uniqueName(siblings, t.newFolderDefaultName)
      : uniqueName(siblings, t.newFileDefaultName)
    const targetPath = pathJoin(parentDir, defaultName)

    try {
      if (kind === 'folder') await window.api.createDirectory(targetPath)
      else await window.api.createFile(targetPath)

      expandAncestors(parentDir)
      await refreshTree()
      setSelectedPath(targetPath)
      setSelectedIsDirectory(kind === 'folder')
      beginRename(targetPath, true, kind === 'folder')
    } catch { /* non-fatal */ }
  }, [
    current,
    renameState,
    selectedPath,
    selectedIsDirectory,
    fileTree,
    expandAncestors,
    refreshTree,
    beginRename,
  ])

  const resolvePasteTargetDir = useCallback((): string | null => {
    if (!current) return null
    return resolveCreateParentDir(current.path, selectedPath, selectedIsDirectory)
  }, [current, selectedPath, selectedIsDirectory])

  const pasteClipboard = useCallback(async (forceTargetDir?: string) => {
    if (!current || !clipboard) return
    const targetDir = forceTargetDir ?? resolvePasteTargetDir()
    if (!targetDir) return

    for (const sourcePath of clipboard.paths) {
      const baseName = pathBasename(sourcePath)
      const siblings = getSiblingNames(fileTree, targetDir, current.path)
      const nextName = uniqueName(siblings, baseName)
      const destPath = pathJoin(targetDir, nextName)
      if (clipboard.op === 'copy') {
        await window.api.copyFileEntry(sourcePath, destPath)
      } else {
        await window.api.renameFile(sourcePath, destPath)
        renameTabPath(sourcePath, destPath, nextName)
      }
    }

    if (clipboard.op === 'cut') setClipboard(null)
    expandAncestors(targetDir)
    await refreshTree()
  }, [clipboard, current, fileTree, expandAncestors, refreshTree, renameTabPath, resolvePasteTargetDir])

  const deleteNode = useCallback(async (path: string) => {
    await window.api.deleteFile(path)
    closeTabByPath(path)
    if (selectedPath === path) {
      setSelectedPath(null)
      setSelectedIsDirectory(false)
    }
    await refreshTree()
  }, [closeTabByPath, refreshTree, selectedPath])

  const handleContextMenu = useCallback((event: React.MouseEvent, node: FileNode) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedPath(node.path)
    setSelectedIsDirectory(node.isDirectory)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      kind: 'node',
      path: node.path,
      isDirectory: node.isDirectory,
    })
  }, [])

  const handleEmptyContextMenu = useCallback((event: React.MouseEvent) => {
    if (!current) return
    event.preventDefault()
    clearSelection()
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'empty' })
  }, [current, clearSelection])

  const handleEmptyAreaMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0) return
    clearSelection()
  }, [clearSelection])

  const handleOpenProjectFolder = useCallback(() => {
    if (!current) return
    void window.api.openPathInOs(current.path)
  }, [current])

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set())
  }, [])

  const moveInternalEntry = useCallback(async (sourcePath: string, destDir: string) => {
    if (!current || !canMoveExplorerEntry(sourcePath, destDir)) return

    const baseName = pathBasename(sourcePath)
    const siblings = getSiblingNames(fileTree, destDir, current.path)
    const nextName = uniqueName(siblings, baseName)
    const destPath = pathJoin(destDir, nextName)

    try {
      await window.api.renameFile(sourcePath, destPath)
      const node = findNodeByPath(fileTree, sourcePath)
      if (node && !node.isDirectory) renameTabPath(sourcePath, destPath, nextName)
      if (selectedPath === sourcePath) {
        setSelectedPath(destPath)
      }
      expandAncestors(destDir)
      await refreshTree()
    } catch {
      /* ignore failed move */
    }
  }, [current, expandAncestors, fileTree, refreshTree, renameTabPath, selectedPath])

  const importExternalPaths = useCallback(async (event: React.DragEvent, destDir: string) => {
    if (!current) return
    const sources = readDroppedOsPaths(event, (file) => window.api.getPathForFile(file))
    if (sources.length === 0) return

    let copied = false
    for (const sourcePath of sources) {
      const normalizedSource = normalizeExplorerPath(sourcePath)
      const normalizedDest = normalizeExplorerPath(destDir)
      if (
        normalizedSource.toLowerCase() === normalizedDest.toLowerCase()
        || isPathWithin(sourcePath, destDir)
      ) {
        continue
      }

      const baseName = pathBasename(sourcePath)
      const siblings = getSiblingNames(fileTree, destDir, current.path)
      const nextName = uniqueName(siblings, baseName)
      const destPath = pathJoin(destDir, nextName)
      try {
        await window.api.copyFileEntry(sourcePath, destPath)
        copied = true
      } catch {
        /* ignore single failed copy */
      }
    }

    if (copied) {
      expandAncestors(destDir)
      await refreshTree()
    }
  }, [current, expandAncestors, fileTree, refreshTree])

  const handleNodeDragStart = useCallback((node: FileNode, event: React.DragEvent) => {
    event.dataTransfer.setData(OPENLLM_EXPLORER_DRAG_MIME, node.path)
    if (!node.isDirectory) {
      event.dataTransfer.setData(OPENLLM_FILE_DRAG_MIME, node.path)
    }
    event.dataTransfer.effectAllowed = 'copyMove'
    setInternalDragPath(node.path)
  }, [])

  const handleNodeDragEnd = useCallback(() => {
    setInternalDragPath(null)
    setDropHoverPath(null)
  }, [])

  const handleNodeDragOver = useCallback((node: FileNode, event: React.DragEvent) => {
    if (!current) return

    const destDir = resolveExplorerDropDir(node)
    const internal = isInternalExplorerDrag(event)
    const external = isExternalOsFileDrag(event)
    if (!internal && !external) return

    if (internal) {
      if (!internalDragPath || !canMoveExplorerEntry(internalDragPath, destDir)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
    } else {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
    }

    setDropHoverPath(node.path)
    if (node.isDirectory && !expandedPaths.has(node.path)) {
      setExpandedPaths((prev) => new Set(prev).add(node.path))
    }
  }, [current, expandedPaths, internalDragPath])

  const handleNodeDragLeave = useCallback((_node: FileNode, event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDropHoverPath((prev) => (prev === _node.path ? null : prev))
    }
  }, [])

  const handleNodeDrop = useCallback((node: FileNode, event: React.DragEvent) => {
    if (!current) return
    event.preventDefault()
    event.stopPropagation()
    setDropHoverPath(null)

    const destDir = resolveExplorerDropDir(node)
    if (isInternalExplorerDrag(event)) {
      const sourcePath = event.dataTransfer.getData(OPENLLM_EXPLORER_DRAG_MIME)
      if (sourcePath) void moveInternalEntry(sourcePath, destDir)
      return
    }
    if (isExternalOsFileDrag(event)) {
      void importExternalPaths(event, destDir)
    }
  }, [current, importExternalPaths, moveInternalEntry])

  const handleRootDragOver = useCallback((event: React.DragEvent) => {
    if (!current) return

    const internal = isInternalExplorerDrag(event)
    const external = isExternalOsFileDrag(event)
    if (!internal && !external) return

    if (internal) {
      if (!internalDragPath || !canMoveExplorerEntry(internalDragPath, current.path)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    } else {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    setDropHoverPath(ROOT_DROP_TARGET)
  }, [current, internalDragPath])

  const handleRootDragLeave = useCallback((event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDropHoverPath((prev) => (prev === ROOT_DROP_TARGET ? null : prev))
    }
  }, [])

  const handleRootDrop = useCallback((event: React.DragEvent) => {
    if (!current) return
    event.preventDefault()
    setDropHoverPath(null)

    if (isInternalExplorerDrag(event)) {
      const sourcePath = event.dataTransfer.getData(OPENLLM_EXPLORER_DRAG_MIME)
      if (sourcePath) void moveInternalEntry(sourcePath, current.path)
      return
    }
    if (isExternalOsFileDrag(event)) {
      void importExternalPaths(event, current.path)
    }
  }, [current, importExternalPaths, moveInternalEntry])

  const handleTreeDragLeave = useCallback((event: React.DragEvent) => {
    if (!treeRef.current?.contains(event.relatedTarget as Node)) {
      setDropHoverPath(null)
    }
  }, [])

  const renameSelection = useCallback(() => {
    if (!selectedPath) return
    beginRename(selectedPath, false, selectedIsDirectory)
  }, [selectedPath, selectedIsDirectory, beginRename])

  const activateSelection = useCallback(() => {
    if (!selectedPath) return
    const node = findNodeByPath(fileTree, selectedPath)
    if (!node) return
    if (node.isDirectory) handleToggleExpand(node.path)
    else handleOpen(node)
  }, [selectedPath, fileTree, handleOpen, handleToggleExpand])

  const moveSelection = useCallback((delta: number) => {
    const visible = flattenVisibleNodes(fileTree, expandedPaths)
    if (visible.length === 0) return
    const currentIndex = selectedPath
      ? visible.findIndex((node) => node.path === selectedPath)
      : -1
    const nextIndex = currentIndex < 0
      ? (delta > 0 ? 0 : visible.length - 1)
      : Math.max(0, Math.min(visible.length - 1, currentIndex + delta))
    const next = visible[nextIndex]
    setSelectedPath(next.path)
    setSelectedIsDirectory(next.isDirectory)
  }, [fileTree, expandedPaths, selectedPath])

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (treeRef.current?.contains(event.target as Node)) {
        explorerActiveRef.current = true
        return
      }
      explorerActiveRef.current = false
    }
    document.addEventListener('mousedown', onDocMouseDown, true)
    return () => document.removeEventListener('mousedown', onDocMouseDown, true)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!explorerActiveRef.current) return

      const state = explorerStateRef.current
      if (!state.current || state.renameState) return

      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const ctrl = event.ctrlKey || event.metaKey
      const isCopy = ctrl && !event.shiftKey && event.code === 'KeyC'
      const isCut = ctrl && !event.shiftKey && event.code === 'KeyX'
      const isPaste = ctrl && !event.shiftKey && event.code === 'KeyV'
      const isExplorerClipboard = isCopy || isCut || isPaste

      if (!isExplorerClipboard && (target.isContentEditable || target.closest('.monaco-editor'))) return

      if (state.contextMenu) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setContextMenu(null)
        }
        return
      }

      if (isCopy && state.selectedPath) {
        event.preventDefault()
        event.stopPropagation()
        setClipboard({ op: 'copy', paths: [state.selectedPath] })
        return
      }
      if (
        (isCut && state.selectedPath)
        || (event.shiftKey && event.key === 'Delete' && state.selectedPath && !ctrl)
      ) {
        event.preventDefault()
        event.stopPropagation()
        setClipboard({ op: 'cut', paths: [state.selectedPath!] })
        return
      }
      if (isPaste && state.clipboard?.paths.length) {
        event.preventDefault()
        event.stopPropagation()
        const targetDir = resolveCreateParentDir(
          state.current.path,
          state.selectedPath,
          state.selectedIsDirectory
        )
        void pasteClipboard(targetDir)
        return
      }
      if (ctrl && event.code === 'Insert' && state.selectedPath) {
        event.preventDefault()
        event.stopPropagation()
        setClipboard({ op: 'copy', paths: [state.selectedPath] })
        return
      }
      if (event.key === 'Delete' && state.selectedPath) {
        event.preventDefault()
        event.stopPropagation()
        void deleteNode(state.selectedPath)
        return
      }
      if (event.key === 'F2' && state.selectedPath) {
        event.preventDefault()
        event.stopPropagation()
        renameSelection()
        return
      }
      if (event.key === 'Enter' && state.selectedPath) {
        event.preventDefault()
        event.stopPropagation()
        activateSelection()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        moveSelection(1)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        moveSelection(-1)
        return
      }
      if (event.key === 'ArrowRight' && state.selectedPath && state.selectedIsDirectory) {
        event.preventDefault()
        event.stopPropagation()
        setExpandedPaths((prev) => new Set(prev).add(state.selectedPath!))
        return
      }
      if (event.key === 'ArrowLeft' && state.selectedPath && state.selectedIsDirectory) {
        event.preventDefault()
        event.stopPropagation()
        setExpandedPaths((prev) => {
          const next = new Set(prev)
          next.delete(state.selectedPath!)
          return next
        })
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        clearSelection()
      }
    }

    const onCopy = (event: ClipboardEvent) => {
      if (!explorerActiveRef.current) return
      const state = explorerStateRef.current
      if (!state.current || state.renameState || state.contextMenu || !state.selectedPath) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      event.preventDefault()
      setClipboard({ op: 'copy', paths: [state.selectedPath] })
    }

    const onPaste = (event: ClipboardEvent) => {
      if (!explorerActiveRef.current) return
      const state = explorerStateRef.current
      if (!state.current || state.renameState || state.contextMenu || !state.clipboard?.paths.length) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (target.isContentEditable || target.closest('.monaco-editor')) return
      event.preventDefault()
      const targetDir = resolveCreateParentDir(
        state.current.path,
        state.selectedPath,
        state.selectedIsDirectory
      )
      void pasteClipboard(targetDir)
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('copy', onCopy, true)
    window.addEventListener('paste', onPaste, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('copy', onCopy, true)
      window.removeEventListener('paste', onPaste, true)
    }
  }, [
    pasteClipboard,
    deleteNode,
    renameSelection,
    activateSelection,
    moveSelection,
    clearSelection,
  ])

  return (
    <div ref={treeRef} className={styles.tree}>
      <div className={styles.header}>
        <span className={styles.projectTitle}>
          {current ? current.name.toUpperCase() : t.explorerHeader}
        </span>
        {current && (
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => void createEntry('file')}
              title={t.newFile}
            >
              <IconNewFile />
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => void createEntry('folder')}
              title={t.newFolder}
            >
              <IconNewFolder />
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={handleCollapseAll}
              title={t.collapseAll}
            >
              <IconCollapseAll />
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={handleOpenProjectFolder}
              title={t.openProjectFolder}
            >
              <IconOpenInExplorer />
            </button>
          </div>
        )}
      </div>

      <div
        className={styles.content}
        onContextMenu={handleEmptyContextMenu}
        onDragOver={handleRootDragOver}
        onDragLeave={handleTreeDragLeave}
        onDrop={handleRootDrop}
      >
        {!current ? (
          <div className={styles.empty}>
            <p>{t.noFolderOpen}</p>
            <button type="button" className={styles.openBtn} onClick={() => openFolder()}>
              {t.openFolder}
            </button>
          </div>
        ) : (
          <>
            {fileTree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                renameState={renameState}
                onSelect={handleSelect}
                onOpen={handleOpen}
                onToggleExpand={handleToggleExpand}
                onContextMenu={handleContextMenu}
                onRenameConfirm={(path, nextName) => void finishRename(path, nextName)}
                onRenameCancel={(path) => void cancelRename(path)}
                dropHoverPath={dropHoverPath}
                internalDragPath={internalDragPath}
                onNodeDragStart={handleNodeDragStart}
                onNodeDragEnd={handleNodeDragEnd}
                onNodeDragOver={handleNodeDragOver}
                onNodeDragLeave={handleNodeDragLeave}
                onNodeDrop={handleNodeDrop}
              />
            ))}
            <div
              className={`${styles.fillArea} ${dropHoverPath === ROOT_DROP_TARGET ? styles.dropTarget : ''}`}
              aria-hidden
              onMouseDown={handleEmptyAreaMouseDown}
              onDragOver={(event) => {
                handleRootDragOver(event)
                event.stopPropagation()
              }}
              onDragLeave={handleRootDragLeave}
              onDrop={(event) => {
                handleRootDrop(event)
                event.stopPropagation()
              }}
            />
          </>
        )}
      </div>

      {contextMenu && (
        <ExplorerContextMenu
          menu={contextMenu}
          canPaste={Boolean(clipboard?.paths.length)}
          onClose={() => setContextMenu(null)}
          onNewFile={() => {
            const root = current!.path
            void createEntry('file', contextMenu.kind === 'empty' ? root : undefined)
            setContextMenu(null)
          }}
          onNewFolder={() => {
            const root = current!.path
            void createEntry('folder', contextMenu.kind === 'empty' ? root : undefined)
            setContextMenu(null)
          }}
          onCollapseAll={() => {
            handleCollapseAll()
            setContextMenu(null)
          }}
          onCopy={() => {
            if (contextMenu.kind !== 'node') return
            setClipboard({ op: 'copy', paths: [contextMenu.path] })
            setContextMenu(null)
          }}
          onCut={() => {
            if (contextMenu.kind !== 'node') return
            setClipboard({ op: 'cut', paths: [contextMenu.path] })
            setContextMenu(null)
          }}
          onPaste={() => {
            const root = current!.path
            void pasteClipboard(contextMenu.kind === 'empty' ? root : undefined)
            setContextMenu(null)
          }}
          onRename={() => {
            if (contextMenu.kind !== 'node') return
            beginRename(contextMenu.path, false, contextMenu.isDirectory)
            setContextMenu(null)
          }}
          onCopyPath={() => {
            const path = contextMenu.kind === 'node' ? contextMenu.path : current!.path
            void navigator.clipboard.writeText(path)
            setContextMenu(null)
          }}
          onOpenProjectFolder={() => {
            handleOpenProjectFolder()
            setContextMenu(null)
          }}
          onDelete={() => {
            if (contextMenu.kind !== 'node') return
            void deleteNode(contextMenu.path)
            setContextMenu(null)
          }}
        />
      )}
    </div>
  )
}
