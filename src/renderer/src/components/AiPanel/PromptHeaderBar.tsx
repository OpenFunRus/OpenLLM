import { forwardRef } from 'react'
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

/** Pinned prompt copy above the scrollable chat area (reserves layout space). */
export const PromptHeaderBar = forwardRef<HTMLDivElement, Props>(function PromptHeaderBar(
  {
    message,
    messageIndex,
    visible = false,
    canEdit = false,
    onEditOpen,
  },
  ref,
): JSX.Element | null {
  if (!visible || !message) return null

  const hasContent = message.content.trim().length > 0 || (message.attachments?.length ?? 0) > 0
  if (!hasContent) return null

  return (
    <div ref={ref} className={styles.bar}>
      <UserPromptBubble
        message={message}
        messageIndex={messageIndex}
        canEdit={canEdit}
        onEditOpen={onEditOpen}
      />
    </div>
  )
})
