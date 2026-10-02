import type { ChatMessage as ChatMessageType } from '@shared/types'
import { t } from '@shared/i18n'
import { IconUndo } from '../icons/Icons'
import styles from './UserPromptBubble.module.css'

interface Props {
  message: ChatMessageType
  messageIndex: number
  canEdit?: boolean
  onEditOpen?: (messageIndex: number) => void
}

export function UserPromptBubble({
  message,
  messageIndex,
  canEdit = false,
  onEditOpen,
}: Props): JSX.Element {
  const hasAttachments = (message.attachments?.length ?? 0) > 0

  return (
    <div className={styles.bubble}>
      {canEdit && onEditOpen && (
        <button
          type="button"
          className={styles.rollback}
          onClick={() => onEditOpen(messageIndex)}
          title={t.editMessage}
          aria-label={t.editMessage}
        >
          <IconUndo size={14} />
        </button>
      )}
      {hasAttachments && (
        <div className={styles.attachHint}>
          {t.attachedImagesCount(message.attachments!.length)}
        </div>
      )}
      {message.content.trim() && (
        <p className={styles.text}>{message.content}</p>
      )}
    </div>
  )
}
