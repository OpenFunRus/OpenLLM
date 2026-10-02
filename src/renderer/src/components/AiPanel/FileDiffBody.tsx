import { useEffect, useMemo, useRef } from 'react'
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
  const viewRef = useRef<HTMLDivElement>(null)

  const displayRows = useMemo(() => {
    const showFull = expanded || live

    if (live && !oldContent && newContent) {
      const rows = streamingAddRows(newContent)
      return showFull ? rows : tailDiffRows(rows, previewLines)
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
      return showFull ? addRows : tailDiffRows(addRows, previewLines)
    }

    if (showFull) {
      return rows
    }
    const collapsed = collapseUnchangedRows(rows)
    return tailDiffRows(collapsed, previewLines)
  }, [oldContent, newContent, expanded, live, previewLines])

  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    if (live) {
      el.scrollTop = el.scrollHeight
    } else if (expanded) {
      const firstChange = el.querySelector('[data-diff-change="true"]') as HTMLElement | null
      if (firstChange) {
        firstChange.scrollIntoView({ block: 'nearest' })
      } else {
        el.scrollTop = 0
      }
    }
  }, [displayRows, live, newContent, expanded])

  if (displayRows.length === 0 && !live) return null

  if (displayRows.length === 0 && live) {
    return (
      <div ref={viewRef} className={`${styles.diffView} ${styles.diffViewLive}`} />
    )
  }

  return (
    <div ref={viewRef} className={`${styles.diffView} ${live ? styles.diffViewLive : ''}`}>
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
          <div
            key={`${entry.type}-${idx}-${lineNum ?? idx}`}
            className={`${styles.diffRow} ${styles[entry.type]}`}
            data-diff-change={entry.type !== 'keep' ? 'true' : undefined}
          >
            <span className={styles.lineNum}>{lineNum ?? ''}</span>
            <span className={styles.gutter}>
              {entry.type === 'add' ? '+' : entry.type === 'remove' ? '-' : ' '}
            </span>
            <span className={styles.lineText}>{entry.text || ' '}</span>
          </div>
        )
      })}
    </div>
  )
}
