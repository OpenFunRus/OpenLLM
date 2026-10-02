import { useUiStore } from '../../store/uiStore'
import { FileTree } from './FileTree'
import styles from './Sidebar.module.css'

export function Sidebar(): JSX.Element {
  const { sidebarPanel } = useUiStore()

  return (
    <div className={styles.sidebar}>
      {sidebarPanel === 'files' && <FileTree />}
    </div>
  )
}
