import { useEffect, useState } from 'react'
import { useGitStore } from '../../store/gitStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useUiStore } from '../../store/uiStore'
import type { GitFileStatus } from '../../../../shared/types'
import { t } from '../../../../shared/i18n'
import styles from './SourceControl.module.css'

const STATUS_COLORS: Record<string, string> = {
  M: '#e8b84b', A: '#3dca7d', D: '#f25c5c', '?': '#888', R: '#4d9cf6', C: '#4d9cf6'
}

function FileStatusRow({
  file, cwd, onStage, onUnstage
}: {
  file: GitFileStatus
  cwd: string
  onStage: (f: GitFileStatus) => void
  onUnstage: (f: GitFileStatus) => void
}): JSX.Element {
  const letter = file.index !== ' ' ? file.index : file.working
  const color = STATUS_COLORS[letter] ?? '#888'
  const isStaged = file.index !== ' ' && file.index !== '?'

  return (
    <div className={styles.fileRow}>
      <span className={styles.statusBadge} style={{ color }}>{letter}</span>
      <span className={styles.fileName} title={file.path}>{file.path.split('/').pop()}</span>
      <span className={styles.fileDir} title={file.path}>
        {file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : ''}
      </span>
      <button
        className={styles.stageBtn}
        onClick={() => isStaged ? onUnstage(file) : onStage(file)}
        title={isStaged ? t.unstage : t.stage}
      >
        {isStaged ? '−' : '+'}
      </button>
    </div>
  )
}

export function SourceControl(): JSX.Element {
  const { current } = useWorkspaceStore()
  const { info, files, commitMessage, refresh, stage, unstage, stageAll, commit, push, pull, setCommitMessage } = useGitStore()
  const { settingsOpen } = useUiStore()
  const [gitName, setGitName] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [gitPat, setGitPat] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const cwd = current?.path ?? ''

  useEffect(() => {
    if (cwd) refresh(cwd)
  }, [cwd, refresh])

  useEffect(() => {
    if (settingsOpen) return
    window.api.getSettings().then((s) => {
      if (s.gitAuthorName) setGitName(s.gitAuthorName)
      if (s.gitAuthorEmail) setGitEmail(s.gitAuthorEmail)
      if (s.githubPat) setGitPat(s.githubPat)
    })
  }, [settingsOpen])

  const staged = files.filter((f) => f.index !== ' ' && f.index !== '?')
  const unstaged = files.filter((f) => f.index === ' ' || f.index === '?')

  const handleCommit = async () => {
    if (!commitMessage.trim()) { setError(t.commitMessageRequired); return }
    try {
      setError(null)
      await commit(cwd, commitMessage, gitName, gitEmail)
      refresh(cwd)
    } catch (e) {
      setError(String(e))
    }
  }

  if (!current) return (
    <div className={styles.empty}>{t.openFolderForGit}</div>
  )

  if (!info?.isRepo) return (
    <div className={styles.empty}>
      <p>{t.notGitRepo}</p>
      <button className={styles.initBtn} onClick={async () => {
        await window.api.gitInit(cwd)
        refresh(cwd)
      }}>{t.initRepository}</button>
    </div>
  )

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{t.sourceControlHeader}</span>
        <div className={styles.actions}>
          <button className="icon-btn" onClick={() => refresh(cwd)} title={t.refresh}>↻</button>
          <button className="icon-btn" onClick={() => pull(cwd, gitPat)} title={t.pull}>⬇</button>
          <button className="icon-btn" onClick={() => push(cwd, gitPat)} title={t.push}>⬆</button>
        </div>
      </div>

      <div className={styles.branchBar}>
        <span className={styles.branchIcon}>⎇</span>
        <span className={styles.branchName}>{info.branch ?? 'HEAD'}</span>
      </div>

      <div className={styles.commitArea}>
        <textarea
          className={styles.commitInput}
          placeholder={t.commitPlaceholder}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') handleCommit() }}
          rows={3}
        />
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.commitBtns}>
          <button className={styles.stageAllBtn} onClick={() => stageAll(cwd).then(() => refresh(cwd))}>
            {t.stageAll}
          </button>
          <button className={styles.commitBtn} onClick={handleCommit}>
            {t.commit}
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          {t.stagedChanges} ({staged.length})
        </div>
        {staged.map((f) => (
          <FileStatusRow key={f.path} file={f} cwd={cwd}
            onStage={(f) => stage(cwd, f.path).then(() => refresh(cwd))}
            onUnstage={(f) => unstage(cwd, f.path).then(() => refresh(cwd))}
          />
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          {t.changes} ({unstaged.length})
        </div>
        {unstaged.map((f) => (
          <FileStatusRow key={f.path} file={f} cwd={cwd}
            onStage={(f) => stage(cwd, f.path).then(() => refresh(cwd))}
            onUnstage={(f) => unstage(cwd, f.path).then(() => refresh(cwd))}
          />
        ))}
      </div>
    </div>
  )
}
