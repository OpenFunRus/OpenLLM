export type DiffRow = {
  type: 'keep' | 'add' | 'remove'
  text: string
  oldLine?: number
  newLine?: number
}

export type DiffDisplayRow = DiffRow | { type: 'collapse'; count: number }

export function isDiffLineRow(entry: DiffDisplayRow): entry is DiffRow {
  return entry.type !== 'collapse'
}

const CONTEXT = 3

export function computeLineDiff(oldText: string, newText: string): DiffRow[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const m = oldLines.length
  const n = newLines.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops: Array<{ type: 'keep' | 'add' | 'remove'; text: string }> = []
  let i = 0
  let j = 0
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      ops.push({ type: 'keep', text: oldLines[i] })
      i++
      j++
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      ops.push({ type: 'add', text: newLines[j] })
      j++
    } else {
      ops.push({ type: 'remove', text: oldLines[i] })
      i++
    }
  }

  const rows: DiffRow[] = []
  let oldLine = 1
  let newLine = 1
  for (const op of ops) {
    if (op.type === 'keep') {
      rows.push({ type: 'keep', text: op.text, oldLine, newLine })
      oldLine++
      newLine++
    } else if (op.type === 'add') {
      rows.push({ type: 'add', text: op.text, newLine })
      newLine++
    } else {
      rows.push({ type: 'remove', text: op.text, oldLine })
      oldLine++
    }
  }

  return rows
}

export function countDiffStats(rows: DiffRow[]): { addCount: number; removeCount: number } {
  let addCount = 0
  let removeCount = 0
  for (const row of rows) {
    if (row.type === 'add') addCount++
    else if (row.type === 'remove') removeCount++
  }
  return { addCount, removeCount }
}

export function collapseUnchangedRows(rows: DiffRow[]): DiffDisplayRow[] {
  const changed = new Set<number>()
  rows.forEach((row, idx) => {
    if (row.type !== 'keep') changed.add(idx)
  })

  const visible = new Set<number>()
  changed.forEach((idx) => {
    for (let c = Math.max(0, idx - CONTEXT); c <= Math.min(rows.length - 1, idx + CONTEXT); c++) {
      visible.add(c)
    }
  })

  const result: DiffDisplayRow[] = []
  let collapseCount = 0
  rows.forEach((row, idx) => {
    if (visible.has(idx)) {
      if (collapseCount > 0) {
        result.push({ type: 'collapse', count: collapseCount })
        collapseCount = 0
      }
      result.push(row)
    } else {
      collapseCount++
    }
  })
  if (collapseCount > 0) result.push({ type: 'collapse', count: collapseCount })
  return result
}

export function relativeDisplayPath(fullPath: string, workspacePath?: string | null): string {
  if (!workspacePath) {
    const parts = fullPath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] ?? fullPath
  }
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '')
  const base = norm(workspacePath)
  const file = norm(fullPath)
  const prefix = `${base}/`
  if (file.startsWith(prefix)) return file.slice(prefix.length)
  return file.split('/').pop() ?? fullPath
}

export function fileExtensionLabel(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? filePath
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return name.slice(0, 3).toUpperCase() || 'FILE'
  return name.slice(dot + 1).slice(0, 4).toUpperCase()
}

export function fileExtensionColor(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'ts':
    case 'tsx':
      return '#3178c6'
    case 'js':
    case 'jsx':
    case 'mjs':
      return '#f7df1e'
    case 'html':
    case 'htm':
      return '#e44d26'
    case 'css':
      return '#2965f1'
    case 'json':
      return '#cbcb41'
    case 'md':
      return '#519aba'
    case 'py':
      return '#3572a5'
    default:
      return '#8b8b8b'
  }
}
