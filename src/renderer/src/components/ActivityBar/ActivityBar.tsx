import { useUiStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { t } from '../../../../shared/i18n'
import {
  IconFiles,
  IconFolderOpen,
  IconModel,
  IconSettings,
} from '../icons/Icons'
import styles from './ActivityBar.module.css'

export function ActivityBar(): JSX.Element {
  const { sidebarPanel, setSidebarPanel, setModelManagerOpen, setSettingsOpen } = useUiStore()
  const { openFolder } = useWorkspaceStore()

  const handleOpenFolder = () => {
    setSidebarPanel('files')
    void openFolder()
  }

  return (
    <div className={styles.bar}>
      <div className={styles.top}>
        <button
          className={styles.item}
          onClick={handleOpenFolder}
          data-tooltip={t.openFolder}
        >
          <IconFolderOpen />
        </button>
        <div className={styles.divider} />
        <button
          className={`${styles.item} ${sidebarPanel === 'files' ? styles.active : ''}`}
          onClick={() => setSidebarPanel('files')}
          data-tooltip={t.explorer}
        >
          <IconFiles />
        </button>
        <button
          className={styles.item}
          onClick={() => setModelManagerOpen(true)}
          data-tooltip={t.modelManager}
        >
          <IconModel />
        </button>
        <button
          className={styles.item}
          onClick={() => setSettingsOpen(true)}
          data-tooltip={t.settings}
        >
          <IconSettings />
        </button>
      </div>
    </div>
  )
}
