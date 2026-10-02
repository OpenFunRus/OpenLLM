import type { FileNode } from '@shared/types'

const INVALID_NAME_CHARS = /[\\/:*?"<>|]/
const WIN_ABS_PATH = /^[a-zA-Z]:[\\/]/

export function parseCodeFenceHeader(header: string): { lang: string; filePath: string | null } {
  const trimmed = header.trim()
  if (!trimmed) return { lang: '', filePath: null }

  if (WIN_ABS_PATH.test(trimmed) || trimmed.startsWith('/')) {
    return { lang: '', filePath: trimmed }
  }

  const colonIdx = trimmed.indexOf(':')
  if (colonIdx > 0) {
    const lang = trimmed.slice(0, colonIdx)
    const filePath = trimmed.slice(colonIdx + 1).trim()
    return { lang, filePath: filePath || null }
  }

  return { lang: trimmed, filePath: null }
}

export function resolveWorkspaceFilePath(
  filePath: string,
  workspacePath?: string | null
): string | null {
  const trimmed = filePath.trim()
  if (!trimmed) return null

  if (WIN_ABS_PATH.test(trimmed)) {
    return trimmed.replace(/\//g, '\\')
  }

  if (trimmed.startsWith('/')) {
    const rel = trimmed.replace(/^\//, '')
    return workspacePath ? pathJoin(workspacePath, rel) : null
  }

  return workspacePath ? pathJoin(workspacePath, trimmed) : null
}

export function pathDirname(filePath: string): string {
  const norm = filePath.replace(/\//g, '\\')
  const idx = norm.lastIndexOf('\\')
  return idx >= 0 ? norm.slice(0, idx) : norm
}

export function normalizeExplorerPath(filePath: string): string {
  return filePath.replace(/\//g, '\\').replace(/[\\]+$/, '')
}

/** True when `candidate` is the same path or nested inside `ancestor`. */
export function isPathWithin(ancestorPath: string, candidatePath: string): boolean {
  const ancestor = normalizeExplorerPath(ancestorPath).toLowerCase()
  const candidate = normalizeExplorerPath(candidatePath).toLowerCase()
  if (candidate === ancestor) return true
  return candidate.startsWith(`${ancestor}\\`)
}

export function resolveExplorerDropDir(node: { path: string; isDirectory: boolean }): string {
  return node.isDirectory ? node.path : pathDirname(node.path)
}

export function isExternalOsFileDrag(event: { dataTransfer: DataTransfer }): boolean {
  const types = Array.from(event.dataTransfer.types)
  return types.includes('Files')
}

export function isInternalExplorerDrag(event: { dataTransfer: DataTransfer }): boolean {
  return Array.from(event.dataTransfer.types).includes('application/x-openllm-explorer-node')
}

export function canMoveExplorerEntry(sourcePath: string, destDir: string): boolean {
  const source = normalizeExplorerPath(sourcePath)
  const dest = normalizeExplorerPath(destDir)
  if (!source || !dest) return false
  if (source.toLowerCase() === dest.toLowerCase()) return false
  if (isPathWithin(sourcePath, destDir)) return false
  const sourceParent = normalizeExplorerPath(pathDirname(sourcePath))
  if (sourceParent.toLowerCase() === dest.toLowerCase()) return false
  return true
}

export function readDroppedOsPaths(
  event: { dataTransfer: DataTransfer },
  getPathForFile: (file: File) => string
): string[] {
  const paths: string[] = []
  for (const file of Array.from(event.dataTransfer.files)) {
    const filePath = getPathForFile(file)
    if (filePath) paths.push(filePath)
  }
  return paths
}

export function pathJoin(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/'
  const trimmedBase = base.endsWith(sep) ? base.slice(0, -1) : base
  return `${trimmedBase}${sep}${name}`
}

export function pathBasename(filePath: string): string {
  const norm = filePath.replace(/\//g, '\\')
  const idx = norm.lastIndexOf('\\')
  return idx >= 0 ? norm.slice(idx + 1) : norm
}

export function isValidFileName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') return false
  if (INVALID_NAME_CHARS.test(trimmed)) return false
  if (/[\x00-\x1f]/.test(trimmed)) return false
  return true
}

export function findNodeByPath(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath)
      if (found) return found
    }
  }
  return null
}

export function getSiblingNames(
  tree: FileNode[],
  parentDir: string,
  workspaceRoot: string
): string[] {
  if (parentDir === workspaceRoot) return tree.map((node) => node.name)
  const parent = findNodeByPath(tree, parentDir)
  return parent?.children?.map((node) => node.name) ?? []
}

export function uniqueName(existing: string[], baseName: string): string {
  if (!existing.includes(baseName)) return baseName
  const dot = baseName.lastIndexOf('.')
  const hasExt = dot > 0
  const stem = hasExt ? baseName.slice(0, dot) : baseName
  const ext = hasExt ? baseName.slice(dot) : ''
  let index = 2
  while (existing.includes(`${stem} ${index}${ext}`)) index += 1
  return `${stem} ${index}${ext}`
}

export function resolveCreateParentDir(
  workspacePath: string,
  selectedPath: string | null,
  selectedIsDirectory: boolean
): string {
  if (!selectedPath) return workspacePath
  if (selectedIsDirectory) return selectedPath
  return pathDirname(selectedPath)
}

export function flattenVisibleNodes(
  nodes: FileNode[],
  expandedPaths: Set<string>
): FileNode[] {
  const result: FileNode[] = []
  const walk = (list: FileNode[]) => {
    for (const node of list) {
      result.push(node)
      if (node.isDirectory && expandedPaths.has(node.path) && node.children?.length) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return result
}

export function ancestorPaths(dirPath: string, workspaceRoot: string): string[] {
  const ancestors: string[] = []
  let current = dirPath
  while (current && current !== workspaceRoot) {
    ancestors.push(current)
    const parent = pathDirname(current)
    if (parent === current) break
    current = parent
  }
  return ancestors
}
