import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAiStore } from '../../store/aiStore'
import { useUiStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useEditorStore } from '../../store/editorStore'
import type { AgentUserContext } from '../../../../shared/agent/types'
import { ChatMessage } from './ChatMessage'
import { ActiveTurnShell } from './ActiveTurnShell'
import { ChatTurnChunk } from './ChatTurnChunk'
import { PromptHeaderBar } from './PromptHeaderBar'
import { splitChatTurns } from './chatTurns'
import { useChatAutoScroll } from './useChatAutoScroll'
import { usePromptHeader } from './usePromptHeader'
import { t } from '../../../../shared/i18n'
import type { ApiModelConfig, ImageAttachment } from '../../../../shared/types'
import { isMediaAttachmentPath, OPENLLM_FILE_DRAG_MIME } from '../../../../shared/attachmentUtils'
import styles from './AiPanel.module.css'
import { ImageLightbox } from './ImageLightbox'
import { ComposerMentionInput } from './ComposerMentionInput'
import { formatFileMention, insertTextAtSelection } from './mentionHighlight'
import { ContextUsageRing } from './ContextUsageRing'
import { relativeDisplayPath } from '../../utils/lineDiff'
import { ComposerContextPanel } from './ComposerContextPanel'
import {
  activeTurnAssistantMessage,
  collectChangedFilesFromMessage,
} from './composerContextUtils'
import { countChatContextTokens } from '../../utils/chatTokenCount'
import { MODEL_CONTEXT_DEFAULT_K, contextKToTokens } from '../../../../shared/modelConfig'
import type { AgentMode, ComposerMode } from '../../../../shared/agent/types'
import {
  analyzeRollbackImpact,
  rollbackImpactHasChanges,
  type RollbackImpact,
} from '../../../../shared/agent/rollbackImpact'
import { EditMessageModal } from '../Modals/EditMessageModal'
import { RollbackConfirmModal } from '../Modals/RollbackConfirmModal'
import {
  IconAttach,
  IconChatTab,
  IconCheck,
  IconChevronDown,
  IconHistory,
  IconHistoryCount,
  IconHistoryDate,
  IconHistoryTitle,
  IconLoader,
  IconModeAgent,
  IconModeChat,
  IconModePlan,
  IconSend,
  IconSettings,
  IconStop,
} from '../icons/Icons'

interface AttachedImage extends ImageAttachment {
  previewUrl: string
}

function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
}

async function clipboardFileToAttachment(file: File): Promise<AttachedImage> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const mimeType = file.type || 'image/png'
  const name = file.name?.trim() || `screenshot-${Date.now()}.png`
  const path = `clipboard://${Date.now()}-${name}`
  return {
    path,
    name,
    mimeType,
    base64,
    previewUrl: `data:${mimeType};base64,${base64}`,
  }
}

const COMPOSER_MODES: ComposerMode[] = ['agent', 'plan', 'chat']

function composerModeLabel(mode: ComposerMode): string {
  switch (mode) {
    case 'chat': return t.chatMode
    case 'plan': return t.planMode
    default: return t.agentMode
  }
}

function ComposerModeIcon({ mode, size = 12 }: { mode: ComposerMode; size?: number }): JSX.Element {
  switch (mode) {
    case 'chat': return <IconModeChat size={size} />
    case 'plan': return <IconModePlan size={size} />
    default: return <IconModeAgent size={size} />
  }
}

function composerModePillClass(mode: ComposerMode): string {
  switch (mode) {
    case 'plan': return styles.modePillPlan
    case 'chat': return styles.modePillChat
    default: return styles.modePillAgent
  }
}

function formatHistoryDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function countUserMessages(messages: { role: string }[]): number {
  return messages.filter((m) => m.role === 'user').length
}

export function AiPanel(): JSX.Element {
  const {
    sessions,
    closedSessions,
    activeSessionId,
    isStreaming,
    streamingSessionId,
    isModelLoaded,
    modelName,
    sendAgentMessage,
    continueAgentRun,
    rollbackToUserMessage,
    editUserMessageAndResend,
    stop,
    createSession,
    closeSession,
    restoreSession,
    setActiveSession,
    getActiveMessages,
    setModelStatus,
    agentPromptTokens,
    agentTodos,
    activePlan,
    setComposerMode,
  } = useAiStore()
  const { modelManagerOpen, setModelManagerOpen, composerMode } = useUiStore()
  const { current: workspace, refreshTree } = useWorkspaceStore()
  const { openTabAtLine } = useEditorStore()
  const [input, setInput] = useState('')
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [composerDragOver, setComposerDragOver] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [contextPanelOpen, setContextPanelOpen] = useState(false)
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const { tabs, activeTabId, cursorLine } = useEditorStore()
  const [models, setModels] = useState<ApiModelConfig[]>([])
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const promptAnchorRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const historyRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownPortalRef = useRef<HTMLDivElement>(null)
  const modelSelectorRef = useRef<HTMLButtonElement>(null)
  const modeDropdownRef = useRef<HTMLDivElement>(null)
  const modeDropdownPortalRef = useRef<HTMLDivElement>(null)
  const modePillRef = useRef<HTMLButtonElement>(null)
  const [modelDropdownPos, setModelDropdownPos] = useState<{ left: number; bottom: number } | null>(null)
  const [modeDropdownPos, setModeDropdownPos] = useState<{ left: number; bottom: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevStreaming = useRef(false)
  const [editTarget, setEditTarget] = useState<{ messageIndex: number; text: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    kind: 'rollback' | 'edit_resend'
    messageIndex: number
    editText?: string
    impact: RollbackImpact
  } | null>(null)

  const messages = getActiveMessages()
  const turns = useMemo(() => splitChatTurns(messages), [messages])
  const activeTurnIndex = Math.max(0, turns.length - 1)
  const isActiveSessionStreaming = isStreaming && streamingSessionId === activeSessionId
  const canSend = isModelLoaded && !isStreaming && (input.trim().length > 0 || attachedImages.length > 0)

  const registerPromptAnchor = useCallback(
    (turnIndex: number) => (el: HTMLDivElement | null) => {
      if (el) promptAnchorRefs.current.set(turnIndex, el)
      else promptAnchorRefs.current.delete(turnIndex)
    },
    [],
  )

  const scrollTailKey = useMemo(() => {
    const last = messages[messages.length - 1]
    if (!last) return ''
    const tools = last.agentSteps?.flatMap((s) => s.tools) ?? last.toolEvents ?? []
    const toolCount = tools.length
    const toolPayloadChars = tools.reduce(
      (n, t) => n + (t.streamBody?.length ?? 0) + (t.result?.length ?? 0),
      0,
    )
    const pendingTools = tools.filter((t) => t.status === 'pending').length
    return [
      last.content.length,
      last.agentReasoningBuffer?.length ?? 0,
      last.agentProseBuffer?.length ?? 0,
      last.agentStreamBuffer?.length ?? 0,
      last.streamingAgentStep ?? 0,
      toolCount,
      pendingTools,
      toolPayloadChars,
      last.agentStatusLine?.length ?? 0,
      last.isStreaming ? 1 : 0,
    ].join('|')
  }, [messages])

  const { handleScroll: handleAutoScroll, pinToBottom } = useChatAutoScroll(
    messagesRef,
    bottomRef,
    scrollTailKey,
    activeSessionId,
  )

  const { headerTurnIndex, showHeaderCopy, syncHeaderFromScroll, headerBarRef } = usePromptHeader(
    activeTurnIndex,
    messagesRef,
    promptAnchorRefs,
    scrollTailKey,
  )

  const headerTurn = turns[headerTurnIndex]

  const handleMessagesScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      handleAutoScroll(e)
      syncHeaderFromScroll()
    },
    [handleAutoScroll, syncHeaderFromScroll],
  )

  const contextUsage = useMemo(() => {
    const activeModel = models.find((m) => m.id === activeModelId)
    const total = contextKToTokens(activeModel?.contextSize ?? MODEL_CONTEXT_DEFAULT_K)
    const estimated = countChatContextTokens(
      messages,
      input,
      attachedImages.map((img) => ({ mimeType: img.mimeType, name: img.name })),
    )
    const used = agentPromptTokens ?? estimated
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
    return { used, total, pct }
  }, [models, activeModelId, messages, input, attachedImages, agentPromptTokens])

  const changedFiles = useMemo(() => {
    const assistant = activeTurnAssistantMessage(turns, activeTurnIndex)
    return collectChangedFilesFromMessage(assistant, workspace?.path ?? null)
  }, [turns, activeTurnIndex, messages, workspace?.path])

  const toggleContextPanel = useCallback(() => {
    setContextPanelOpen((open) => !open)
  }, [])

  const openChangedFile = useCallback(
    (filePath: string, revealLine?: number) => {
      const name = filePath.split(/[/\\]/).pop() ?? filePath
      void openTabAtLine(filePath, name, revealLine)
    },
    [openTabAtLine]
  )

  const loadModels = useCallback(async () => {
    const [list, settings] = await Promise.all([
      window.api.listModels(),
      window.api.getSettings(),
    ])
    setModels(list)
    setActiveModelId(settings.activeModelId)
  }, [])

  useEffect(() => { void loadModels() }, [loadModels])
  useEffect(() => {
    if (!modelManagerOpen) void loadModels()
  }, [modelManagerOpen, loadModels])

  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      refreshTree()
    }
    prevStreaming.current = isStreaming
  }, [isStreaming, refreshTree])

  useEffect(() => {
    if (!historyOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [historyOpen])

  const updateModelDropdownPos = useCallback(() => {
    if (!modelSelectorRef.current) return
    const rect = modelSelectorRef.current.getBoundingClientRect()
    setModelDropdownPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 6,
    })
  }, [])

  useEffect(() => {
    if (!modelDropdownOpen) {
      setModelDropdownPos(null)
      return
    }
    updateModelDropdownPos()
    window.addEventListener('resize', updateModelDropdownPos)
    window.addEventListener('scroll', updateModelDropdownPos, true)
    return () => {
      window.removeEventListener('resize', updateModelDropdownPos)
      window.removeEventListener('scroll', updateModelDropdownPos, true)
    }
  }, [modelDropdownOpen, updateModelDropdownPos])

  useEffect(() => {
    if (!modelDropdownOpen) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (modelDropdownRef.current?.contains(target)) return
      if (modelDropdownPortalRef.current?.contains(target)) return
      setModelDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [modelDropdownOpen])

  const updateModeDropdownPos = useCallback(() => {
    if (!modePillRef.current) return
    const rect = modePillRef.current.getBoundingClientRect()
    setModeDropdownPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 6,
    })
  }, [])

  useEffect(() => {
    if (!modeDropdownOpen) {
      setModeDropdownPos(null)
      return
    }
    updateModeDropdownPos()
    window.addEventListener('resize', updateModeDropdownPos)
    window.addEventListener('scroll', updateModeDropdownPos, true)
    return () => {
      window.removeEventListener('resize', updateModeDropdownPos)
      window.removeEventListener('scroll', updateModeDropdownPos, true)
    }
  }, [modeDropdownOpen, updateModeDropdownPos])

  useEffect(() => {
    if (!modeDropdownOpen) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (modeDropdownRef.current?.contains(target)) return
      if (modeDropdownPortalRef.current?.contains(target)) return
      setModeDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [modeDropdownOpen])

  const pickImages = async () => {
    if (!isModelLoaded || isStreaming) return
    const picked = await window.api.pickImageFiles()
    if (picked.length === 0) return

    setAttachedImages((prev) => {
      const next = [...prev]
      for (const file of picked) {
        if (next.some((f) => f.path === file.path)) continue
        next.push({
          ...file,
          previewUrl: file.mimeType.startsWith('image/')
            ? `data:${file.mimeType};base64,${file.base64}`
            : '',
        })
      }
      return next
    })
  }

  const removeAttachedImage = (path: string) => {
    setAttachedImages((prev) => prev.filter((f) => f.path !== path))
  }

  const insertFileMention = useCallback((filePath: string) => {
    const relative = relativeDisplayPath(filePath, workspace?.path ?? null)
    const mention = formatFileMention(relative)
    const token = `${mention} `
    const textarea = textareaRef.current
    const selectionStart = textarea?.selectionStart ?? 0
    const selectionEnd = textarea?.selectionEnd ?? 0

    let nextCursor = 0
    setInput((prev) => {
      if (textarea) {
        const inserted = insertTextAtSelection(prev, token, selectionStart, selectionEnd)
        nextCursor = inserted.cursor
        return inserted.next
      }
      const prefix = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
      const next = `${prev}${prefix}${token}`
      nextCursor = next.length
      return next
    })

    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(nextCursor, nextCursor)
    })
  }, [workspace?.path])

  const attachWorkspacePath = useCallback(async (filePath: string) => {
    if (!filePath.trim()) return

    if (isMediaAttachmentPath(filePath)) {
      try {
        const file = await window.api.readAttachment(filePath)
        setAttachedImages((prev) => {
          if (prev.some((f) => pathsEqual(f.path, file.path))) return prev
          return [
            ...prev,
            {
              ...file,
              previewUrl: file.mimeType.startsWith('image/')
                ? `data:${file.mimeType};base64,${file.base64}`
                : '',
            },
          ]
        })
      } catch {
        /* ignore unreadable media */
      }
      return
    }

    insertFileMention(filePath)
  }, [insertFileMention])

  const handleComposerDragOver = useCallback((e: React.DragEvent) => {
    if (!isModelLoaded || isStreaming) return
    if (
      e.dataTransfer.types.includes(OPENLLM_FILE_DRAG_MIME)
      || e.dataTransfer.types.includes('Files')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setComposerDragOver(true)
    }
  }, [isModelLoaded, isStreaming])

  const handleComposerDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setComposerDragOver(false)
  }, [])

  const handleComposerDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setComposerDragOver(false)
    if (!isModelLoaded || isStreaming) return

    const explorerPath = e.dataTransfer.getData(OPENLLM_FILE_DRAG_MIME)
    if (explorerPath) {
      await attachWorkspacePath(explorerPath)
      return
    }

    for (const file of Array.from(e.dataTransfer.files)) {
      const filePath = window.api.getPathForFile(file)
      if (filePath) await attachWorkspacePath(filePath)
    }
  }, [attachWorkspacePath, isModelLoaded, isStreaming])

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!isModelLoaded || isStreaming) return
    const items = e.clipboardData?.items
    if (!items) return

    const imageItems: DataTransferItem[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) imageItems.push(item)
    }
    if (imageItems.length === 0) return

    e.preventDefault()
    const nextImages: AttachedImage[] = []
    for (const item of imageItems) {
      const file = item.getAsFile()
      if (!file) continue
      try {
        nextImages.push(await clipboardFileToAttachment(file))
      } catch { /* ignore clipboard read errors */ }
    }
    if (nextImages.length === 0) return

    setAttachedImages((prev) => {
      const merged = [...prev]
      for (const img of nextImages) {
        if (!merged.some((f) => f.path === img.path)) merged.push(img)
      }
      return merged
    })
  }, [isModelLoaded, isStreaming])

  const buildUserContext = useCallback((): AgentUserContext => ({
    workspacePath: workspace?.path ?? null,
    openFiles: tabs.map((tab) => ({
      path: (tab as { path?: string; filePath?: string }).path ?? tab.filePath,
      isActive: tab.id === activeTabId,
      cursorLine: tab.id === activeTabId ? cursorLine : undefined,
    })),
    timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
  }), [workspace, tabs, activeTabId, cursorLine])

  const buildRollbackImpact = useCallback((messageIndex: number, scope: 'rollback' | 'edit_resend') => {
    return analyzeRollbackImpact(messages, messageIndex, scope, {
      workspacePath: workspace?.path ?? null,
      hasActivePlan: Boolean(activePlan),
      todoCount: agentTodos.length,
      planName: activePlan?.name,
    })
  }, [activePlan, agentTodos.length, messages, workspace?.path])

  const executeRollback = useCallback((messageIndex: number) => {
    void rollbackToUserMessage(messageIndex, workspace?.path ?? null)
  }, [rollbackToUserMessage, workspace?.path])

  const executeEditResend = useCallback((messageIndex: number, text: string) => {
    void editUserMessageAndResend(messageIndex, text, workspace?.path, buildUserContext(), {
      mode: composerMode,
      sessionId: activeSessionId ?? undefined,
    })
  }, [
    activeSessionId,
    buildUserContext,
    composerMode,
    editUserMessageAndResend,
    workspace?.path,
  ])

  const handleEditOpen = useCallback((messageIndex: number) => {
    const message = messages[messageIndex]
    if (!message || message.role !== 'user') return
    setEditTarget({ messageIndex, text: message.content })
  }, [messages])

  const handleEditSubmit = useCallback((text: string) => {
    if (!editTarget) return
    const { messageIndex } = editTarget
    setEditTarget(null)
    const impact = buildRollbackImpact(messageIndex, 'edit_resend')
    if (!rollbackImpactHasChanges(impact)) {
      executeEditResend(messageIndex, text)
      return
    }
    setConfirmAction({ kind: 'edit_resend', messageIndex, editText: text, impact })
  }, [buildRollbackImpact, editTarget, executeEditResend])

  const handleConfirmAction = useCallback(() => {
    if (!confirmAction) return
    const { kind, messageIndex, editText } = confirmAction
    setConfirmAction(null)
    if (kind === 'rollback') {
      executeRollback(messageIndex)
      return
    }
    if (editText) executeEditResend(messageIndex, editText)
  }, [confirmAction, executeEditResend, executeRollback])

  const handleImplementPlan = useCallback(async (filePath: string, planName?: string) => {
    if (!isModelLoaded || isStreaming) return
    setComposerMode('agent')
    const displayPath = relativeDisplayPath(filePath, workspace?.path ?? null)
    const prompt = planName?.trim()
      ? `Реализуй план «${planName.trim()}» из файла ${displayPath}. Открой план, следуй ему шаг за шагом и внеси все необходимые изменения.`
      : `Реализуй план из файла ${displayPath}. Открой план, следуй ему шаг за шагом и внеси все необходимые изменения.`
    await sendAgentMessage(prompt, workspace?.path ?? null, buildUserContext(), {
      mode: 'agent',
      sessionId: activeSessionId ?? undefined,
    })
  }, [
    activeSessionId,
    buildUserContext,
    isModelLoaded,
    isStreaming,
    sendAgentMessage,
    setComposerMode,
    workspace?.path,
  ])

  const handleSwitchModel = async (modelId: string) => {
    if (modelId === activeModelId) {
      setModelDropdownOpen(false)
      return
    }
    try {
      setSwitchingModelId(modelId)
      await window.api.loadModel(modelId)
      const model = models.find((m) => m.id === modelId)
      setModelStatus(true, model?.displayName ?? null)
      setActiveModelId(modelId)
    } catch {
      /* ignore */
    } finally {
      setSwitchingModelId(null)
      setModelDropdownOpen(false)
    }
  }

  const handleSend = async () => {
    if (!canSend) return
    pinToBottom()

    const text = input.trim()
    setInput('')

    const images = attachedImages.map(({ path, name, mimeType, base64 }) => ({
      path, name, mimeType, base64,
    }))
    const displayAttachments = attachedImages.map(({ name, mimeType, previewUrl, base64 }) => ({
      kind: 'image' as const,
      name,
      mimeType,
      dataUrl: previewUrl || `data:${mimeType};base64,${base64}`,
    }))
    setAttachedImages([])

    const prompt = text || t.imageOnlyPrompt
    const sendOpts = {
      images: images.length > 0 ? images : undefined,
      displayText: text,
      displayAttachments: displayAttachments.length > 0 ? displayAttachments : undefined,
    }

    const userContext: AgentUserContext = {
      workspacePath: workspace?.path ?? null,
      openFiles: tabs.map((tab) => ({
        path: tab.path,
        isActive: tab.id === activeTabId,
        cursorLine: tab.id === activeTabId ? cursorLine : undefined
      })),
      timezoneOffsetMinutes: -new Date().getTimezoneOffset()
    }
    await sendAgentMessage(prompt, workspace?.path, userContext, {
      ...sendOpts,
      sessionId: activeSessionId ?? undefined,
      mode: composerMode,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    closeSession(id)
  }

  const handleRestore = (id: string) => {
    restoreSession(id)
    setHistoryOpen(false)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        <div className={styles.tabsScroll}>
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`${styles.chatTab} ${session.id === activeSessionId ? styles.chatTabActive : ''} ${session.id === streamingSessionId ? styles.chatTabStreaming : ''}`}
              onClick={() => setActiveSession(session.id)}
              data-tooltip={session.title}
            >
              <span className={styles.chatTabIcon}><IconChatTab /></span>
              <span className={styles.chatTabTitle}>{session.title}</span>
              <button
                className={styles.chatTabClose}
                onClick={(e) => handleCloseTab(e, session.id)}
                data-tooltip={t.closeChat}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button className={styles.newChatBtn} onClick={() => createSession()} data-tooltip={t.newChat}>
          +
        </button>
        <div className={styles.historyWrap} ref={historyRef}>
          <button
            className={`${styles.historyBtn} ${historyOpen ? styles.historyBtnActive : ''}`}
            onClick={() => setHistoryOpen((v) => !v)}
            data-tooltip={t.chatHistory}
          >
            <IconHistory />
          </button>
          {historyOpen && (
            <div className={styles.historyMenu}>
              {closedSessions.length === 0 ? (
                <div className={styles.historyEmpty}>{t.noClosedChats}</div>
              ) : (
                closedSessions.map((session) => (
                  <button
                    key={session.id}
                    className={styles.historyItem}
                    onClick={() => handleRestore(session.id)}
                    data-tooltip={t.restoreChat}
                  >
                    <span className={styles.historyItemTitle}>
                      <IconHistoryTitle className={styles.historyItemIcon} />
                      <span className={styles.historyItemTitleText}>{session.title}</span>
                    </span>
                    <span className={styles.historyItemCount}>
                      <IconHistoryCount className={styles.historyItemIcon} />
                      {countUserMessages(session.messages)}
                    </span>
                    <span className={styles.historyItemDate}>
                      <IconHistoryDate className={styles.historyItemIcon} />
                      {formatHistoryDate(session.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {!isModelLoaded && (
        <div className={styles.noModel}>
          <span>{t.noModelLoaded}</span>
          <button className={styles.loadBtn} onClick={() => setModelManagerOpen(true)}>
            {t.loadModel}
          </button>
        </div>
      )}

      <div className={styles.messagesColumn}>
        <PromptHeaderBar
          ref={headerBarRef}
          message={headerTurn?.userMessage ?? null}
          messageIndex={headerTurn?.userIndex ?? 0}
          visible={showHeaderCopy}
          canEdit={!isActiveSessionStreaming}
          onEditOpen={handleEditOpen}
        />
        <div
          ref={messagesRef}
          className={styles.messages}
          onScroll={handleMessagesScroll}
        >
          {turns.slice(0, activeTurnIndex).map((turn) => (
            <ChatTurnChunk
              key={turn.userMessage.id}
              turn={turn}
              onPromptAnchor={registerPromptAnchor(turn.turnIndex)}
              onEditOpen={handleEditOpen}
              onImplementPlan={(path, name) => void handleImplementPlan(path, name)}
              onContinue={(messageId) => {
                void continueAgentRun(messageId, workspace?.path ?? null, buildUserContext())
              }}
            />
          ))}
          {turns[activeTurnIndex] && (
            <ActiveTurnShell
              key={turns[activeTurnIndex].userMessage.id}
              turn={turns[activeTurnIndex]}
              isStreaming={isActiveSessionStreaming}
              onPromptAnchor={registerPromptAnchor(activeTurnIndex)}
              onEditOpen={handleEditOpen}
              onImplementPlan={(path, name) => void handleImplementPlan(path, name)}
              onContinue={(messageId) => {
                void continueAgentRun(messageId, workspace?.path ?? null, buildUserContext())
              }}
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className={styles.composerWrap}>
        <ComposerContextPanel
          expanded={contextPanelOpen}
          onToggle={toggleContextPanel}
          contextUsage={contextUsage}
          todos={agentTodos}
          changedFiles={changedFiles}
          onOpenFile={openChangedFile}
        />

        <div
          className={`${styles.composer} ${composerDragOver ? styles.composerDragOver : ''}`}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={(e) => void handleComposerDrop(e)}
        >
          {attachedImages.length > 0 && (
            <div className={styles.imagePreviews}>
              {attachedImages.map((img) => (
                <div
                  key={img.path}
                  className={styles.imageThumb}
                  onClick={() => {
                    if (img.previewUrl) setLightbox({ src: img.previewUrl, alt: img.name })
                  }}
                >
                  {img.previewUrl ? (
                    <img src={img.previewUrl} alt={img.name} className={styles.imageThumbImg} />
                  ) : (
                    <div className={styles.pdfThumb}>PDF</div>
                  )}
                  <button
                    type="button"
                    className={styles.imageThumbRemove}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeAttachedImage(img.path)
                    }}
                    data-tooltip={t.deleteFile}
                    aria-label={t.deleteFile}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <ComposerMentionInput
            inputRef={textareaRef}
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onPaste={(e) => void handlePaste(e)}
            disabled={!isModelLoaded || isStreaming}
            placeholder={isModelLoaded ? t.askPlaceholder : t.loadModelFirst}
          />

          <div className={styles.composerFooter}>
            <div className={styles.composerLeft}>
              <div className={styles.modeDropdownWrap} ref={modeDropdownRef}>
                <button
                  ref={modePillRef}
                  className={`${styles.modePill} ${composerModePillClass(composerMode)}`}
                  type="button"
                  onClick={() => setModeDropdownOpen((v) => !v)}
                  data-tooltip={t.switchMode}
                >
                  <span className={styles.modeIcon}><ComposerModeIcon mode={composerMode} /></span>
                  <span>{composerModeLabel(composerMode)}</span>
                  <IconChevronDown />
                </button>
                {modeDropdownOpen && modeDropdownPos && createPortal(
                  <div
                    ref={modeDropdownPortalRef}
                    className={styles.composerDropdown}
                    style={{ left: modeDropdownPos.left, bottom: modeDropdownPos.bottom }}
                  >
                    {COMPOSER_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={styles.composerDropdownItem}
                        onClick={() => {
                          setComposerMode(mode)
                          setModeDropdownOpen(false)
                        }}
                      >
                        <span className={styles.composerDropdownItemIcon}>
                          <ComposerModeIcon mode={mode} size={16} />
                        </span>
                        <span className={styles.composerDropdownItemLabel}>{composerModeLabel(mode)}</span>
                        <span className={styles.composerDropdownItemCheck}>
                          {mode === composerMode && <IconCheck size={14} />}
                        </span>
                      </button>
                    ))}
                  </div>,
                  document.body,
                )}
              </div>

              <div className={styles.modelDropdownWrap} ref={modelDropdownRef}>
                <button
                  ref={modelSelectorRef}
                  className={styles.modelSelector}
                  type="button"
                  onClick={() => setModelDropdownOpen((v) => !v)}
                  disabled={!isModelLoaded && models.length === 0}
                  data-tooltip={t.switchModel}
                >
                  <span className={styles.modelSelectorText}>
                    {modelName ?? t.noModelLoaded}
                  </span>
                  <IconChevronDown />
                </button>
                {modelDropdownOpen && modelDropdownPos && createPortal(
                  <div
                    ref={modelDropdownPortalRef}
                    className={`${styles.composerDropdown} ${styles.modelDropdown}`}
                    style={{ left: modelDropdownPos.left, bottom: modelDropdownPos.bottom }}
                  >
                    {models.length === 0 ? (
                      <div className={styles.composerDropdownEmpty}>{t.noModelsConfigured}</div>
                    ) : (
                      models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={styles.composerDropdownItem}
                          onClick={() => void handleSwitchModel(m.id)}
                          disabled={switchingModelId !== null}
                        >
                          <span className={styles.composerDropdownItemLabel}>{m.displayName}</span>
                          <span className={styles.composerDropdownItemCheck}>
                            {switchingModelId === m.id ? (
                              <IconLoader size={14} className={styles.composerDropdownSpinner} />
                            ) : m.id === activeModelId ? (
                              <IconCheck size={14} />
                            ) : null}
                          </span>
                        </button>
                      ))
                    )}
                    <div className={styles.composerDropdownDivider} />
                    <button
                      type="button"
                      className={`${styles.composerDropdownItem} ${styles.composerDropdownFooter}`}
                      onClick={() => {
                        setModelDropdownOpen(false)
                        setModelManagerOpen(true)
                      }}
                    >
                      <span className={styles.composerDropdownItemIcon}>
                        <IconSettings size={14} />
                      </span>
                      <span className={styles.composerDropdownItemLabel}>{t.manageModels}</span>
                    </button>
                  </div>,
                  document.body
                )}
              </div>
            </div>

            <div className={styles.composerRight}>
              {isModelLoaded && (
                <ContextUsageRing
                  className={styles.composerAction}
                  used={contextUsage.used}
                  total={contextUsage.total}
                  title={t.contextUsageTooltip(contextUsage.pct, contextUsage.used, contextUsage.total)}
                  onClick={toggleContextPanel}
                />
              )}
              <button
                className={styles.composerAction}
                type="button"
                onClick={() => void pickImages()}
                disabled={!isModelLoaded || isStreaming}
                data-tooltip={t.attachFile}
              >
                <IconAttach size={15} strokeWidth={1.5} />
              </button>
              {isStreaming ? (
                <button
                  className={`${styles.composerAction} ${styles.composerActionSend} ${styles.composerActionSendActive}`}
                  type="button"
                  onClick={stop}
                  data-tooltip={t.stop}
                >
                  <IconStop size={11} />
                </button>
              ) : (
                <button
                  className={`${styles.composerAction} ${styles.composerActionSend} ${canSend ? styles.composerActionSendActive : ''}`}
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  data-tooltip={t.send}
                >
                  <IconSend size={13} strokeWidth={2.25} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ImageLightbox
        src={lightbox?.src ?? ''}
        alt={lightbox?.alt ?? ''}
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
      />

      {editTarget && (
        <EditMessageModal
          initialText={editTarget.text}
          onSubmit={handleEditSubmit}
          onCancel={() => setEditTarget(null)}
        />
      )}

      {confirmAction && (
        <RollbackConfirmModal
          impact={confirmAction.impact}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
