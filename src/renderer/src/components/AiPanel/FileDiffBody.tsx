import { useMemo } from 'react'
import { t } from '@shared/i18n'
import {
  collapseUnchangedRows,
  computeLineDiff,
  type DiffDisplayRow,
  isDiffLineRow,
} from '../../utils/lineDiff'
import styles from './FileDiffBody.module.css'

interface Props {
  oldContent: string
  newContent: string
  expanded?: boolean
  live?: boolean
  previewLines?: number
}

function tailDiffRows(rows: DiffDisplayRow[], maxChangeLines: number): DiffDisplayRow[] {
  const indices: number[] = []
  rows.forEach((row, idx) => {
    if (isDiffLineRow(row) && row.type !== 'keep') indices.push(idx)
  })
  if (indices.length === 0) {
    return rows.slice(-maxChangeLines)
  }
  const startIdx = indices[Math.max(0, indices.length - maxChangeLines)]
  let from = startIdx
  for (let i = startIdx - 1; i >= 0; i--) {
    const row = rows[i]
    if (!isDiffLineRow(row) && row.type === 'collapse') {
      from = i
      break
    }
    if (isDiffLineRow(row) && row.type === 'keep') from = i
    else break
  }
  return rows.slice(from)
}

function streamingAddRows(content: string): DiffDisplayRow[] {
  const lines = content.split('\n')
  return lines.map((text, idx) => ({
    type: 'add' as const,
    text,
    newLine: idx + 1,
  }))
}

export function FileDiffBody({
  oldContent,
  newContent,
  expanded = false,
  live = false,
  previewLines = 4,
}: Props): JSX.Element | null {
  const displayRows = useMemo(() => {
    if (live && !oldContent && newContent) {
      const rows = streamingAddRows(newContent)
      return expanded ? rows : tailDiffRows(rows, previewLines)
    }

    if (!newContent && !oldContent) return []

    const isNewFile = !oldContent
    const rows = computeLineDiff(oldContent, newContent)
    const hasChanges = rows.some((r) => r.type !== 'keep')

    if (isNewFile || !hasChanges) {
      const addRows = newContent.split('\n').map((text, idx) => ({
        type: 'add' as const,
        text,
        newLine: idx + 1,
      }))
      return expanded ? addRows : tailDiffRows(addRows, previewLines)
    }

    const collapsed = collapseUnchangedRows(rows)
    return expanded ? collapsed : tailDiffRows(collapsed, previewLines)
  }, [oldContent, newContent, expanded, live, previewLines])

  if (displayRows.length === 0 && !live) return null

  if (displayRows.length === 0 && live) {
    return (
      <div className={`${styles.diffView} ${styles.diffViewLive}`}>
        <span className={styles.cursor}>▋</span>
      </div>
    )
  }

  return (
    <div className={`${styles.diffView} ${live ? styles.diffViewLive : ''}`}>
      {displayRows.map((entry, idx) => {
        if (!isDiffLineRow(entry)) {
          return (
            <div key={`c-${idx}`} className={styles.collapse}>
              {t.unchangedLines(entry.count)}
            </div>
          )
        }
        const lineNum =
          entry.type === 'remove'
            ? entry.oldLine
            : entry.type === 'add'
              ? entry.newLine
              : entry.newLine ?? entry.oldLine
        return (
          <div key={`${entry.type}-${idx}-${lineNum ?? idx}`} className={`${styles.diffRow} ${styles[entry.type]}`}>
            <span className={styles.lineNum}>{lineNum ?? ''}</span>
            <span className={styles.gutter}>
              {entry.type === 'add' ? '+' : entry.type === 'remove' ? '-' : ' '}
            </span>
            <span className={styles.lineText}>{entry.text || ' '}</span>
          </div>
        )
      })}
      {live && <span className={styles.cursor}>▋</span>}
    </div>
  )
}
