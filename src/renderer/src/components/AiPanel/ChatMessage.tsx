import { useState, useCallback } from 'react'
import { ImageLightbox } from './ImageLightbox'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useUiStore } from '../../store/uiStore'
import { useAiStore } from '../../store/aiStore'
import type { ChatMessage as ChatMessageType } from '@shared/types'
import { t } from '@shared/i18n'
import styles from './ChatMessage.module.css'
import { renderMessageContent } from './messageContent'
import { AgentStepsTimeline } from './AgentStepsTimeline'
import { IconCopy, IconCheck, IconUndo } from '../icons/Icons'

const TERM_ID = 'main'

interface Props {
  message: ChatMessageType
  messageIndex: number
  onEditOpen?: (messageIndex: number) => void
  onImplementPlan?: (filePath: string, planName?: string) => void
  onContinue?: (messageId: string) => void
}

export function ChatMessage({
  message,
  messageIndex,
  onEditOpen,
  onImplementPlan,
  onContinue,
}: Props): JSX.Element {
  const { current: workspace, refreshTree } = useWorkspaceStore()
  const { terminalVisible, toggleTerminal } = useUiStore()
  const { isStreaming } = useAiStore()
  const [copied, setCopied] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState<Record<string, 'pending' | 'ok' | 'err'>>({})
  const [runStatus, setRunStatus] = useState<Record<string, 'ran' | 'err'>>({})
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const isUser = message.role === 'user'
  const canMutate = isUser && !isStreaming && !message.isStreaming

  const deleteFile = useCallback(async (filePath: string) => {
    const base = workspace?.path
    const winAbsolute = /^[a-zA-Z]:/.test(filePath)
    const unixAbsolute = filePath.startsWith('/')
    let fullPath: string
    if (winAbsolute) fullPath = filePath
    else if (unixAbsolute) fullPath = base ? `${base}/${filePath.replace(/^\//, '')}` : filePath
    else fullPath = base ? `${base}/${filePath}` : filePath
    setDeleteStatus((s) => ({ ...s, [filePath]: 'pending' }))
    try {
      await window.api.deleteFile(fullPath)
      setDeleteStatus((s) => ({ ...s, [filePath]: 'ok' }))
      await refreshTree()
    } catch {
      setDeleteStatus((s) => ({ ...s, [filePath]: 'err' }))
    }
  }, [workspace, refreshTree])

  const runCommand = useCallback((cmd: string) => {
    if (!terminalVisible) toggleTerminal()
    window.api.termWrite(TERM_ID, cmd + '\r')
    setRunStatus((s) => ({ ...s, [cmd]: 'ran' }))
  }, [terminalVisible, toggleTerminal])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const hasAttachments = (message.attachments?.length ?? 0) > 0

  const hasAgentTimeline = !isUser && (
    (message.agentSteps?.length ?? 0) > 0
    || (message.toolEvents?.length ?? 0) > 0
    || (message.thinkingBlocks?.length ?? 0) > 0
    || Boolean(message.isStreaming && message.streamingAgentStep)
    || Boolean(message.isStreaming && message.agentHasToolActivity)
    || Boolean(message.isStreaming && message.agentStreamBuffer)
    || Boolean(message.isStreaming && message.agentReasoningBuffer)
    || Boolean(message.isStreaming && message.agentProseBuffer?.trim())
    || Boolean(message.agentStatusLine?.trim())
  )

  const proseInTimeline = Boolean(
    message.agentSteps?.some((s) => (s.proseBlocks?.length ?? 0) > 0)
    || (message.isStreaming && message.agentProseBuffer?.trim())
  )
  const showStandaloneContent = !hasAgentTimeline || (
    !message.isStreaming &&
    Boolean(message.content.trim()) &&
    !proseInTimeline
  )
  const displayContent = showStandaloneContent ? message.content : ''
  const hasContent = displayContent.trim().length > 0

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canMutate || !onEditOpen) return
    onEditOpen(messageIndex)
  }

  return (
    <div className={`${styles.msg} ${isUser ? styles.user : styles.assistant}`}>
      <div className={styles.content}>
        {hasAgentTimeline && (
          <AgentStepsTimeline
            message={message}
            workspacePath={workspace?.path}
            onImplementPlan={onImplementPlan}
          />
        )}
        {isUser ? (
          <div className={styles.userBubbleWrap}>
            {canMutate && (
              <button
                type="button"
                className={styles.userBubbleRollback}
                onClick={handleEditClick}
                data-tooltip={t.editMessage}
                aria-label={t.editMessage}
              >
                <IconUndo size={14} />
              </button>
            )}
            {hasAttachments && (
              <div className={styles.userAttachments}>
                {message.attachments!.map((att) => (
                  att.mimeType.startsWith('image/') ? (
                    <button
                      key={att.name + att.dataUrl.slice(0, 32)}
                      type="button"
                      className={styles.userAttachmentThumb}
                      onClick={(e) => {
                        e.stopPropagation()
                        setLightbox({ src: att.dataUrl, alt: att.name })
                      }}
                      data-tooltip={att.name}
                    >
                      <img src={att.dataUrl} alt={att.name} className={styles.userAttachmentImg} />
                    </button>
                  ) : (
                    <div key={att.name} className={styles.userAttachmentPdf}>PDF</div>
                  )
                ))}
              </div>
            )}
            {message.content.trim() && (
              <p className={styles.userParagraph}>{message.content}</p>
            )}
          </div>
        ) : (
          hasContent && renderMessageContent(
            displayContent,
            isUser,
            deleteFile,
            runCommand,
            deleteStatus,
            runStatus,
            workspace?.path
          )
        )}
        {message.isStreaming && !hasAgentTimeline && !hasContent && !isUser && (
          <span className={styles.cursor}>▋</span>
        )}
        {!isUser && !message.isStreaming && message.agentCanContinue && onContinue && (
          <div className={styles.continueWrap}>
            <span className={styles.continueHint}>{t.agentContinueHint}</span>
            <button
              type="button"
              className={styles.continueBtn}
              onClick={() => onContinue(message.id)}
            >
              {t.agentContinue}
            </button>
          </div>
        )}
      </div>
      {!isUser && !message.isStreaming && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={copyToClipboard}
            data-tooltip={copied ? t.copied : t.copy}
            aria-label={copied ? t.copied : t.copy}
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </button>
        </div>
      )}
      <ImageLightbox
        src={lightbox?.src ?? ''}
        alt={lightbox?.alt ?? ''}
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
      />
    </div>
  )
}
