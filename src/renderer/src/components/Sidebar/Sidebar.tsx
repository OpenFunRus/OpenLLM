import { useUiStore } from '../../store/uiStore'
import { FileTree } from './FileTree'
import { SourceControl } from './SourceControl'
import { GitHubPanel } from './GitHubPanel'
import styles from './Sidebar.module.css'

export function Sidebar(): JSX.Element {
  const { sidebarPanel } = useUiStore()

  return (
    <div className={styles.sidebar}>
      {sidebarPanel === 'files' && <FileTree />}
      {sidebarPanel === 'git' && <SourceControl />}
      {sidebarPanel === 'github' && <GitHubPanel />}
    </div>
  )
}
