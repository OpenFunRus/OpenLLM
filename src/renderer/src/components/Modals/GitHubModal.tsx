import { useState, useEffect } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useGitStore } from '../../store/gitStore'
import type { GitHubRepo, GitHubPR } from '../../../../shared/types'
import { t } from '../../../../shared/i18n'
import styles from './GitHubModal.module.css'

export function GitHubModal(): JSX.Element | null {
  const { githubModalOpen, setGithubModalOpen } = useUiStore()
  const { current } = useWorkspaceStore()
  const { info } = useGitStore()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [pat, setPat] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [prs, setPrs] = useState<GitHubPR[]>([])
  const [prTitle, setPrTitle] = useState('')
  const [prBase, setPrBase] = useState('main')
  const [prBody, setPrBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'repos' | 'prs' | 'create-pr'>('repos')

  useEffect(() => {
    if (githubModalOpen) {
      window.api.githubStatus().then(({ isAuthenticated, username }) => {
        setIsAuthenticated(isAuthenticated)
        setUsername(username)
        if (isAuthenticated) loadRepos()
      })
    }
  }, [githubModalOpen])

  if (!githubModalOpen) return null

  const loadRepos = async () => {
    setLoading(true)
    try {
      const r = await window.api.githubRepos()
      setRepos(r)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  const loadPRs = async (repo: GitHubRepo) => {
    setSelectedRepo(repo)
    setTab('prs')
    setLoading(true)
    try {
      const [owner, repoName] = repo.fullName.split('/')
      const p = await window.api.githubPRs(owner, repoName)
      setPrs(p)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  const handleAuth = async () => {
    try {
      setError(null)
      const user = await window.api.githubAuth(pat)
      setIsAuthenticated(true)
      setUsername(user)
      setPat('')
      loadRepos()
    } catch (e) { setError(t.authFailed) }
  }

  const handleCreatePR = async () => {
    if (!selectedRepo || !prTitle.trim() || !info?.branch) return
    try {
      setError(null)
      setLoading(true)
      const pr = await window.api.githubCreatePR({
        repoFullName: selectedRepo.fullName,
        title: prTitle,
        body: prBody,
        head: info.branch,
        base: prBase
      })
      setPrs((prev) => [pr, ...prev])
      setTab('prs')
      setPrTitle(''); setPrBody('')
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <div className={styles.overlay} onClick={() => setGithubModalOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t.github}</span>
          {username && <span className={styles.userBadge}>@{username}</span>}
          <button className="icon-btn" onClick={() => setGithubModalOpen(false)}>✕</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {!isAuthenticated ? (
          <div className={styles.authForm}>
            <p className={styles.authHint}>{t.githubPatHintModal} <code>repo</code>.</p>
            <input
              className={styles.patInput}
              type="password"
              placeholder={t.githubPatPlaceholder}
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
            />
            <button className={styles.authBtn} onClick={handleAuth}>{t.connect}</button>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.tabs}>
              <button className={`${styles.tabBtn} ${tab === 'repos' ? styles.activeTab : ''}`} onClick={() => setTab('repos')}>{t.repositories}</button>
              {selectedRepo && <button className={`${styles.tabBtn} ${tab === 'prs' ? styles.activeTab : ''}`} onClick={() => setTab('prs')}>{t.pullRequests}</button>}
              {selectedRepo && <button className={`${styles.tabBtn} ${tab === 'create-pr' ? styles.activeTab : ''}`} onClick={() => setTab('create-pr')}>{t.createPr}</button>}
            </div>

            {tab === 'repos' && (
              <div className={styles.list}>
                {loading ? <div className={styles.loading}>{t.loading}</div> : repos.map((r) => (
                  <div key={r.id} className={styles.repoRow} onClick={() => loadPRs(r)}>
                    <span className={styles.repoName}>{r.fullName}</span>
                    {r.private && <span className={styles.privateBadge}>{t.private}</span>}
                  </div>
                ))}
              </div>
            )}

            {tab === 'prs' && selectedRepo && (
              <div className={styles.list}>
                <div className={styles.listHeader}>{t.prListHeader(selectedRepo.fullName)}</div>
                {loading ? <div className={styles.loading}>{t.loading}</div> : prs.length === 0 ? (
                  <div className={styles.empty}>{t.noOpenPrs}</div>
                ) : prs.map((pr) => (
                  <a key={pr.number} href={pr.url} target="_blank" rel="noreferrer" className={styles.prRow}>
                    <span className={styles.prNumber}>#{pr.number}</span>
                    <span className={styles.prTitle}>{pr.title}</span>
                    <span className={styles.prAuthor}>@{pr.author}</span>
                  </a>
                ))}
              </div>
            )}

            {tab === 'create-pr' && selectedRepo && (
              <div className={styles.createForm}>
                <div className={styles.createLabel}>{t.repository} {selectedRepo.fullName}</div>
                <input className={styles.formInput} placeholder={t.prTitlePlaceholder} value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
                <input className={styles.formInput} placeholder={t.prBasePlaceholder} value={prBase} onChange={(e) => setPrBase(e.target.value)} />
                <textarea className={styles.formTextarea} placeholder={t.prBodyPlaceholder} value={prBody} onChange={(e) => setPrBody(e.target.value)} rows={4} />
                <button className={styles.createBtn} onClick={handleCreatePR} disabled={loading || !prTitle.trim()}>
                  {loading ? t.creating : t.createPullRequest}
                </button>
              </div>
            )}

            <div className={styles.footer}>
              <button className={styles.logoutBtn} onClick={() => { window.api.githubLogout(); setIsAuthenticated(false); setUsername(null); setRepos([]) }}>
                {t.signOut}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
