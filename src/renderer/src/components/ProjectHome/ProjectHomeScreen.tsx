import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { RecentWorkspaceInfo } from '../../../../shared/types'
import { useUiStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { iconStroke } from '../icons/Icons'
import { t } from '../../../../shared/i18n'
import styles from './ProjectHomeScreen.module.css'

function formatOpenedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProjectHomeScreen(): JSX.Element {
  const { setProjectManagerOpen } = useUiStore()
  const { current: workspace, openFolder, openFolderFromDialog, isLoading } = useWorkspaceStore()
  const [recent, setRecent] = useState<RecentWorkspaceInfo[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)

  const canDismiss = Boolean(workspace)

  useEffect(() => {
    setLoadingRecent(true)
    void window.api.getRecentWorkspaces()
      .then(setRecent)
      .finally(() => setLoadingRecent(false))
  }, [])

  useEffect(() => {
    if (!canDismiss) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectManagerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canDismiss, setProjectManagerOpen])

  return (
    <div className={styles.screen}>
      {canDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setProjectManagerOpen(false)}
          aria-label={t.close}
        >
          ✕
        </button>
      )}

      <div className={styles.inner}>
        <header className={styles.brand}>
          <div className={styles.brandMark}>⬡</div>
          <h1 className={styles.brandName}>{t.appName}</h1>
          <p className={styles.brandSub}>{t.appSubtitle}</p>
        </header>

        <button
          type="button"
          className={styles.openCard}
          disabled={isLoading}
          onClick={() => void openFolderFromDialog()}
        >
          <span className={styles.openIcon}>
            <FolderOpen size={22} strokeWidth={iconStroke(22)} />
          </span>
          <span className={styles.openLabel}>{t.projectHomeOpenProject}</span>
        </button>

        <section className={styles.recentSection}>
          <div className={styles.recentHeader}>
            <span className={styles.recentTitle}>{t.projectManagerTitle}</span>
            {!loadingRecent && recent.length > 0 && (
              <span className={styles.recentCount}>{t.projectHomeRecentCount(recent.length)}</span>
            )}
          </div>

          {loadingRecent ? (
            <p className={styles.recentEmpty}>{t.projectManagerLoading}</p>
          ) : recent.length === 0 ? (
            <p className={styles.recentEmpty}>{t.projectManagerEmpty}</p>
          ) : (
            <ul className={styles.recentList}>
              {recent.map((item) => (
                <li key={item.path}>
                  <button
                    type="button"
                    className={styles.recentRow}
                    disabled={isLoading}
                    onClick={() => void openFolder(item.path)}
                  >
                    <span className={styles.recentName}>{item.name}</span>
                    <span className={styles.recentPath}>{item.path}</span>
                    <span className={styles.recentDate}>{formatOpenedAt(item.lastOpenedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
