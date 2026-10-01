import fs from 'fs/promises'
import type { ToolDispatchResult } from '../../../shared/agent/toolDispatch'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPathOrError } from '../AgentToolContext'

type NotebookCell = {
  cell_type: string
  source: string[] | string
  metadata?: Record<string, unknown>
}

type NotebookJson = {
  cells: NotebookCell[]
  metadata?: Record<string, unknown>
  nbformat?: number
  nbformat_minor?: number
}

const LANGUAGE_TO_CELL_TYPE: Record<string, string> = {
  python: 'code',
  markdown: 'markdown',
  javascript: 'code',
  typescript: 'code',
  r: 'code',
  sql: 'code',
  shell: 'code',
  raw: 'raw',
  other: 'code',
}

const LANGUAGE_METADATA: Record<string, Record<string, string>> = {
  python: { name: 'python' },
  javascript: { name: 'javascript' },
  typescript: { name: 'typescript' },
  r: { name: 'r' },
  sql: { name: 'sql' },
  shell: { name: 'shell' },
}

function cellSourceToString(source: string[] | string): string {
  return Array.isArray(source) ? source.join('') : source
}

function stringToCellSource(value: string): string[] {
  if (value.includes('\n')) {
    return value.split('\n').map((line, idx, arr) => (idx < arr.length - 1 ? `${line}\n` : line))
  }
  return [value]
}

export async function executeEditNotebook(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<ToolDispatchResult> {
  const notebookPath = String(args.target_notebook ?? '')
  if (!notebookPath.trim()) return 'Error: target_notebook is required'

  let filePath: string
  try {
    filePath = resolveAgentPathOrError(ctx, notebookPath)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }

  const cellIdx = Number(args.cell_idx)
  if (Number.isNaN(cellIdx) || cellIdx < 0) return 'Error: cell_idx must be a non-negative number'

  const isNewCell = args.is_new_cell === true
  const cellLanguage = String(args.cell_language ?? 'python')
  const oldString = String(args.old_string ?? '')
  const newString = String(args.new_string ?? '')

  let notebook: NotebookJson
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    notebook = JSON.parse(raw) as NotebookJson
  } catch (err) {
    if (isNewCell && cellIdx === 0) {
      notebook = { cells: [], nbformat: 4, nbformat_minor: 5, metadata: {} }
    } else {
      return `Error: Failed to read notebook: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  if (!Array.isArray(notebook.cells)) notebook.cells = []

  if (isNewCell) {
    const cellType = LANGUAGE_TO_CELL_TYPE[cellLanguage] ?? 'code'
    const cell: NotebookCell = {
      cell_type: cellType,
      source: stringToCellSource(newString),
      metadata: cellType === 'code' ? buildCodeMetadata(cellLanguage) : {},
    }
    const insertAt = Math.min(cellIdx, notebook.cells.length)
    notebook.cells.splice(insertAt, 0, cell)
  } else {
    if (cellIdx >= notebook.cells.length) {
      return `Error: cell_idx ${cellIdx} out of range (${notebook.cells.length} cells)`
    }
    const cell = notebook.cells[cellIdx]
    const current = cellSourceToString(cell.source)
    if (!current.includes(oldString)) {
      return `Error: old_string not found in cell ${cellIdx}`
    }
    const occurrences = current.split(oldString).length - 1
    if (occurrences !== 1) {
      return `Error: old_string must match exactly once in cell ${cellIdx} (found ${occurrences})`
    }
    cell.source = stringToCellSource(current.replace(oldString, newString))
    if (cell.cell_type === 'code') {
      cell.metadata = { ...(cell.metadata ?? {}), ...buildCodeMetadata(cellLanguage) }
    }
  }

  await fs.writeFile(filePath, `${JSON.stringify(notebook, null, 2)}\n`, 'utf-8')
  return { content: `Notebook updated: ${filePath}`, filePath }
}

function buildCodeMetadata(language: string): Record<string, unknown> {
  const langMeta = LANGUAGE_METADATA[language]
  if (!langMeta) return { language }
  return {
    language,
    kernelspec: undefined,
    ...langMeta,
  }
}
