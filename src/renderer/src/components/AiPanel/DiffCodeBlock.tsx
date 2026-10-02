import { useEffect, useState } from 'react'
import {
  fileExtensionColor,
  fileExtensionLabel,
  relativeDisplayPath,
} from '../../utils/lineDiff'
import {
  pathBasename,
  resolveWorkspaceFilePath,
} from '../Sidebar/explorerPathUtils'
import { useEditorStore } from '../../store/editorStore'
import { FileDiffBody } from './FileDiffBody'
import { StreamBubble } from './StreamBubble'
import toolStyles from './AgentToolBubble.module.css'

interface Props {
  filePath: string
  lang: string
  newCode: string
  workspacePath?: string
}

function FileTypeIcon({ filePath }: { filePath: string }): JSX.Element {
  const label = fileExtensionLabel(filePath)
  const color = fileExtensionColor(label.toLowerCase())
  return (
    <span className={toolStyles.fileIcon} style={{ color }}>
      {label}
    </span>
  )
}

export function DiffCodeBlock({ filePath, newCode, workspacePath }: Props): JSX.Element {
  const [oldContent, setOldContent] = useState('')
  const { openTabAtLine } = useEditorStore()
  const fullPath = resolveWorkspaceFilePath(filePath, workspacePath)
  const displayName = relativeDisplayPath(filePath, workspacePath)
  const canOpen = Boolean(fullPath)

  useEffect(() => {
    if (!fullPath) return
    window.api.readFile(fullPath).then(setOldContent).catch(() => setOldContent(''))
  }, [fullPath])

  const openFile = () => {
    if (!fullPath) return
    const name = pathBasename(fullPath)
    void openTabAtLine(fullPath, name, 1)
  }

  return (
    <StreamBubble
      title={
        <>
          <FileTypeIcon filePath={filePath} />
          <span className={canOpen ? undefined : toolStyles.fileName}>{displayName}</span>
        </>
      }
      onTitleClick={canOpen ? openFile : undefined}
      pinPreview
      bodyNode={(showFull) => (
        <FileDiffBody
          oldContent={oldContent}
          newContent={newCode}
          expanded={showFull}
        />
      )}
      className={toolStyles.toolBubble}
      bodyClassName={toolStyles.diffBody}
    />
  )
}
