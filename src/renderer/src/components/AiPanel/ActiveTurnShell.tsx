import type { ChatTurn } from './chatTurns'
import { ChatMessage } from './ChatMessage'
import { UserPromptBubble } from './UserPromptBubble'
import { t } from '@shared/i18n'
import styles from './ActiveTurnShell.module.css'

interface Props {
  turn: ChatTurn
  isStreaming?: boolean
  onPromptAnchor?: (el: HTMLDivElement | null) => void
  onEditOpen?: (messageIndex: number) => void
  onImplementPlan?: (filePath: string, planName?: string) => void
  onContinue?: (messageId: string) => void
}

function assistantIsEmpty(message: ChatTurn['replyMessages'][number]): boolean {
  if (message.content.trim()) return false
  if (message.agentSteps?.length) return false
  if (message.toolEvents?.length) return false
  if (message.thinkingBlocks?.length) return false
  if (message.agentStreamBuffer?.trim()) return false
  if (message.agentReasoningBuffer?.trim()) return false
  if (message.agentProseBuffer?.trim()) return false
  if (message.streamingAgentStep) return false
  if (message.agentHasToolActivity) return false
  return true
}

export function ActiveTurnShell({
  turn,
  isStreaming = false,
  onPromptAnchor,
  onEditOpen,
  onImplementPlan,
  onContinue,
}: Props): JSX.Element {
  const showWaiting =
    isStreaming &&
    (turn.replyMessages.length === 0 ||
      turn.replyMessages.every((m) => m.isStreaming && assistantIsEmpty(m)))

  return (
    <div className={styles.shell}>
      <div ref={onPromptAnchor} className={styles.promptAnchor}>
        <UserPromptBubble
          message={turn.userMessage}
          messageIndex={turn.userIndex}
          canEdit={!isStreaming && !turn.userMessage.isStreaming}
          onEditOpen={onEditOpen}
        />
      </div>
      <div className={styles.body}>
        {showWaiting && (
          <div className={styles.waiting}>
            <span className={styles.waitingDot} />
            <span>{t.agentWorking}</span>
          </div>
        )}
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
    </div>
  )
}
