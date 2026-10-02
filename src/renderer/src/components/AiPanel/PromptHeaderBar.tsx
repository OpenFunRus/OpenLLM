import type { ChatMessage as ChatMessageType } from '@shared/types'
import { UserPromptBubble } from './UserPromptBubble'
import styles from './PromptHeaderBar.module.css'

interface Props {
  message: ChatMessageType | null
  messageIndex: number
  visible?: boolean
  canEdit?: boolean
  onEditOpen?: (messageIndex: number) => void
}

/** Fixed prompt copy above the scrollable chat area. */
export function PromptHeaderBar({
  message,
  messageIndex,
  visible = false,
  canEdit = false,
  onEditOpen,
}: Props): JSX.Element | null {
  if (!visible || !message) return null

  const hasContent = message.content.trim().length > 0 || (message.attachments?.length ?? 0) > 0
  if (!hasContent) return null

  return (
    <div className={styles.bar}>
      <UserPromptBubble
        message={message}
        messageIndex={messageIndex}
        canEdit={canEdit}
        onEditOpen={onEditOpen}
      />
    </div>
  )
}
