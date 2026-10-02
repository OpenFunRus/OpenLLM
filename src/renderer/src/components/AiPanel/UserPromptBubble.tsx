import type { ChatMessage as ChatMessageType } from '@shared/types'
import { t } from '@shared/i18n'
import { IconUndo } from '../icons/Icons'
import { renderTextWithMentions } from './mentionHighlight'
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
  const attachments = message.attachments ?? []
  const imageAttachments = attachments.filter(
    (a) => a.kind === 'image' || (!a.kind && Boolean(a.dataUrl))
  )
  const legacyCount = attachments.length > 0 && imageAttachments.length === 0

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
      {imageAttachments.length > 0 && (
        <div className={styles.attachments}>
          {imageAttachments.map((img) => (
            img.dataUrl?.startsWith('data:image/') ? (
              <div key={img.name} className={styles.imageThumb}>
                <img src={img.dataUrl} alt={img.name} className={styles.imageThumbImg} />
              </div>
            ) : (
              <span key={img.name} className={styles.pdfBadge}>PDF</span>
            )
          ))}
        </div>
      )}
      {legacyCount && (
        <div className={styles.attachHint}>
          {t.attachedImagesCount(attachments.length)}
        </div>
      )}
      {message.content.trim() && (
        <p className={styles.text}>{renderTextWithMentions(message.content)}</p>
      )}
    </div>
  )
}
