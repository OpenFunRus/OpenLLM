import { useState, useEffect } from 'react'
import { t } from '../../../../shared/i18n'
import styles from './DiffCodeBlock.module.css'

interface Props {
  filePath: string
  lang: string
  newCode: string
  workspacePath?: string
}

type DiffLine = { type: 'keep' | 'add' | 'remove'; text: string }

function resolveFull(filePath: string, workspacePath?: string): string {
  const winAbsolute = /^[a-zA-Z]:/.test(filePath)
  const unixAbsolute = filePath.startsWith('/')
  if (winAbsolute) return filePath
  if (unixAbsolute) return workspacePath ? `${workspacePath}/${filePath.replace(/^\//, '')}` : filePath
  return workspacePath ? `${workspacePath}/${filePath}` : filePath
}

function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length
  const n = newLines.length
  // LCS dynamic programming table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: DiffLine[] = []
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      ops.push({ type: 'keep', text: oldLines[i] }); i++; j++
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      ops.push({ type: 'add', text: newLines[j] }); j++
    } else {
      ops.push({ type: 'remove', text: oldLines[i] }); i++
    }
  }
  return ops
}

// Collapse long unchanged runs, keeping CONTEXT lines around each change
const CONTEXT = 3

function collapseUnchanged(lines: DiffLine[]): (DiffLine | { type: 'collapse'; count: number })[] {
  const changed = new Set<number>()
  lines.forEach((l, idx) => { if (l.type !== 'keep') changed.add(idx) })

  const visible = new Set<number>()
  changed.forEach((idx) => {
    for (let c = Math.max(0, idx - CONTEXT); c <= Math.min(lines.length - 1, idx + CONTEXT); c++) {
      visible.add(c)
    }
  })

  const result: (DiffLine | { type: 'collapse'; count: number })[] = []
  let collapseCount = 0
  lines.forEach((line, idx) => {
    if (visible.has(idx)) {
      if (collapseCount > 0) {
        result.push({ type: 'collapse', count: collapseCount })
        collapseCount = 0
      }
      result.push(line)
    } else {
      collapseCount++
    }
  })
  if (collapseCount > 0) result.push({ type: 'collapse', count: collapseCount })
  return result
}

export function DiffCodeBlock({ filePath, lang, newCode, workspacePath }: Props): JSX.Element {
  const [oldContent, setOldContent] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [showDiff, setShowDiff] = useState(true)

  useEffect(() => {
    const fullPath = resolveFull(filePath, workspacePath)
    window.api.readFile(fullPath).then((content) => {
      setOldContent(content)
      setIsNew(false)
    }).catch(() => {
      setOldContent(null)
      setIsNew(true)
    })
  }, [filePath, workspacePath])

  const hasDiff = !isNew && oldContent !== null
  const diffLines = hasDiff ? computeDiff(oldContent.split('\n'), newCode.split('\n')) : null
  const hasChanges = diffLines ? diffLines.some((l) => l.type !== 'keep') : true
  const displayLines = diffLines && hasChanges ? collapseUnchanged(diffLines) : diffLines

  const addCount = diffLines?.filter((l) => l.type === 'add').length ?? 0
  const removeCount = diffLines?.filter((l) => l.type === 'remove').length ?? 0

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.filePath}>{filePath}</span>
          {hasDiff && hasChanges && (
            <span className={styles.diffStat}>
              {addCount > 0 && <span className={styles.added}>+{addCount}</span>}
              {removeCount > 0 && <span className={styles.removed}>-{removeCount}</span>}
            </span>
          )}
          {isNew && <span className={styles.newBadge}>{t.newFileBadge}</span>}
          {hasDiff && !hasChanges && <span className={styles.unchanged}>{t.noChanges}</span>}
        </div>
        {hasDiff && hasChanges && (
          <button
            className={`${styles.toggleBtn} ${showDiff ? styles.active : ''}`}
            onClick={() => setShowDiff((v) => !v)}
          >
            {showDiff ? t.source : t.diff}
          </button>
        )}
      </div>

      {showDiff && hasDiff && hasChanges && displayLines ? (
        <div className={styles.diffView}>
          {displayLines.map((entry, idx) => {
            if ('count' in entry) {
              return (
                <div key={idx} className={styles.collapse}>
                  {t.unchangedLines(entry.count)}
                </div>
              )
            }
            const { type, text } = entry
            return (
              <div key={idx} className={`${styles.diffLine} ${styles[type]}`}>
                <span className={styles.gutter}>
                  {type === 'add' ? '+' : type === 'remove' ? '-' : ' '}
                </span>
                <span className={styles.lineText}>{text}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <pre className={styles.source}><code>{newCode}</code></pre>
      )}
    </div>
  )
}
