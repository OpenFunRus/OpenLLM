import type { AgentTodoItem } from '@shared/agent/types'
import { t } from '@shared/i18n'
import { IconChevronDown } from '../Sidebar/ExplorerIcons'
import { AgentTodoPanel } from './AgentTodoPanel'
import type { ComposerChangedFile } from './composerContextUtils'
import { fileExtensionColor, fileExtensionLabel } from '../../utils/lineDiff'
import styles from './ComposerContextPanel.module.css'

interface ContextUsage {
  used: number
  total: number
  pct: number
}

interface Props {
  expanded: boolean
  onToggle: () => void
  contextUsage: ContextUsage
  todos: AgentTodoItem[]
  changedFiles: ComposerChangedFile[]
  onOpenFile: (filePath: string, revealLine?: number) => void
}

function FileExtIcon({ filePath }: { filePath: string }): JSX.Element {
  const label = fileExtensionLabel(filePath)
  const color = fileExtensionColor(label.toLowerCase())
  return (
    <span className={styles.fileIcon} style={{ color }}>
      {label}
    </span>
  )
}

function contextBarClass(pct: number): string {
  if (pct > 75) return styles.contextBarFillDanger
  if (pct >= 50) return styles.contextBarFillWarn
  return styles.contextBarFill
}

export function ComposerContextPanel({
  expanded,
  onToggle,
  contextUsage,
  todos,
  changedFiles,
  onOpenFile,
}: Props): JSX.Element {
  const visibleTodos = todos.filter((item) => item.status !== 'cancelled')
  const hasTodos = visibleTodos.length > 0
  const hasFiles = changedFiles.length > 0
  const fillPct = Math.min(100, Math.max(0, contextUsage.pct))

  return (
    <div className={styles.panel}>
      {expanded && (
        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>{t.composerContextSectionContext}</div>
            <div className={styles.contextBlock}>
              <div className={styles.contextBarTrack}>
                <div
                  className={contextBarClass(fillPct)}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              <div className={styles.contextMeta}>
                <span className={styles.contextPct}>{fillPct}%</span>
                <span className={styles.contextTokens}>
                  {contextUsage.used.toLocaleString('ru-RU')}
                  {' / '}
                  {contextUsage.total.toLocaleString('ru-RU')}
                </span>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>{t.composerContextSectionTodos}</div>
            {hasTodos ? (
              <AgentTodoPanel todos={todos} embedded />
            ) : (
              <div className={styles.emptyHint}>{t.composerContextTodosEmpty}</div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>{t.composerContextSectionFiles}</div>
            {hasFiles ? (
              <ul className={styles.fileList}>
                {changedFiles.map((file) => (
                  <li key={file.filePath}>
                    <button
                      type="button"
                      className={styles.fileItem}
                      onClick={() => onOpenFile(file.filePath, file.revealLine)}
                    >
                      <FileExtIcon filePath={file.filePath} />
                      <span className={styles.fileName}>{file.displayName}</span>
                      <span className={styles.fileStats}>
                        {file.addCount > 0 && (
                          <span className={styles.added}>+{file.addCount}</span>
                        )}
                        {file.removeCount > 0 && (
                          <span className={styles.removed}>-{file.removeCount}</span>
                        )}
                      </span>
                      {file.isPending && <span className={styles.pendingDot} aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyHint}>{t.composerContextFilesEmpty}</div>
            )}
          </section>
        </div>
      )}

      <button
        type="button"
        className={styles.toggle}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronUp : ''}`}>
          <IconChevronDown />
        </span>
        <span className={styles.toggleLabel}>{t.composerContextPanelTitle}</span>
      </button>
    </div>
  )
}
