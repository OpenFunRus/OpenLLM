import type { ChatTurn } from './chatTurns'
import { ChatMessage } from './ChatMessage'
import { UserPromptBubble } from './UserPromptBubble'
import styles from './ChatTurnChunk.module.css'

interface Props {
  turn: ChatTurn
  onPromptAnchor?: (el: HTMLDivElement | null) => void
  onEditOpen?: (messageIndex: number) => void
  onImplementPlan?: (filePath: string, planName?: string) => void
  onContinue?: (messageId: string) => void
}

export function ChatTurnChunk({
  turn,
  onPromptAnchor,
  onEditOpen,
  onImplementPlan,
  onContinue,
}: Props): JSX.Element {
  return (
    <div className={styles.turn}>
      <div ref={onPromptAnchor} className={styles.promptAnchor}>
        <UserPromptBubble
          message={turn.userMessage}
          messageIndex={turn.userIndex}
          canEdit
          onEditOpen={onEditOpen}
        />
      </div>
      {turn.replyMessages.map((message, replyIdx) => (
        <ChatMessage
          key={message.id}
          message={message}
          messageIndex={turn.messageIndices[replyIdx + 1] ?? turn.userIndex + 1 + replyIdx}
          onEditOpen={onEditOpen}
          onImplementPlan={onImplementPlan}
          onContinue={onContinue}
        />
      ))}
    </div>
  )
}
