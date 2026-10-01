import { useState, useEffect } from 'react'
import { useUiStore } from '../../store/uiStore'
import { t } from '../../../../shared/i18n'
import styles from './GitHubPanel.module.css'

export function GitHubPanel(): JSX.Element {
  const { setGithubModalOpen } = useUiStore()
  const [status, setStatus] = useState<{ isAuthenticated: boolean; username: string | null }>({
    isAuthenticated: false, username: null
  })

  useEffect(() => {
    window.api.githubStatus().then(setStatus)
  }, [])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{t.githubHeader}</span>
      </div>
      <div className={styles.body}>
        {status.isAuthenticated ? (
          <p className={styles.user}>{t.signedInAs} <strong>{status.username}</strong></p>
        ) : (
          <p className={styles.hint}>{t.notConnectedGithub}</p>
        )}
        <button className={styles.btn} onClick={() => setGithubModalOpen(true)}>
          {status.isAuthenticated ? t.openGithubPanel : t.connectGithub}
        </button>
      </div>
    </div>
  )
}
