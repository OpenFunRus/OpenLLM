import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAiStore } from '../../store/aiStore'
import { useUiStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useEditorStore } from '../../store/editorStore'
import type { AgentUserContext } from '../../../../shared/agent/types'
import { ChatMessage } from './ChatMessage'
import { t } from '../../../../shared/i18n'
import type { ApiModelConfig, ImageAttachment } from '../../../../shared/types'
import styles from './AiPanel.module.css'
import { ImageLightbox } from './ImageLightbox'
import { ContextUsageRing } from './ContextUsageRing'
import { relativeDisplayPath } from '../../utils/lineDiff'
import { AgentTodoPanel } from './AgentTodoPanel'
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

interface AttachedImage extends ImageAttachment {
  previewUrl: string
}

const INPUT_MIN_HEIGHT = 22
const INPUT_MAX_HEIGHT = 160
const MESSAGE_WINDOW = 80

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

const COMPOSER_MODES: ComposerMode[] = ['agent', 'plan', 'ask', 'chat']

function composerModeLabel(mode: ComposerMode): string {
  switch (mode) {
    case 'chat': return t.chatMode
    case 'ask': return t.askMode
    case 'plan': return t.planMode
    default: return t.agentMode
  }
}

function composerModeIcon(mode: ComposerMode): string {
  switch (mode) {
    case 'chat': return '···'
    case 'ask': return '?'
    case 'plan': return '☰'
    default: return '∞'
  }
}

function composerModePillClass(mode: ComposerMode): string {
  switch (mode) {
    case 'plan': return styles.modePillPlan
    case 'ask': return styles.modePillAsk
    case 'chat': return styles.modePillChat
    default: return styles.modePillAgent
  }
}

function composerModeDotClass(mode: ComposerMode): string {
  switch (mode) {
    case 'plan': return styles.modeOptionDotPlan
    case 'ask': return styles.modeOptionDotAsk
    case 'chat': return styles.modeOptionDotChat
    default: return styles.modeOptionDotAgent
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

function IconHistoryTitle(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.historyItemIcon}>
      <path
        d="M3 4.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8l-2.5 2v-2H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconHistoryCount(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.historyItemIcon}>
      <path
        d="M8 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M3.5 13.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconHistoryDate(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.historyItemIcon}>
      <rect x="3" y="4" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 7h10M6 2.5v2.5M10 2.5v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconChatTab(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 4.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8l-2.5 2v-2H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconHistory(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 5v3.2l2.2 1.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconAttach(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.5 4.5l-4.2 4.2a2 2 0 1 0 2.8 2.8l4.5-4.5a3 3 0 1 0-4.2-4.2L5.2 7.2"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconSend(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 12.5V3.5M8 3.5L4.5 7.5M8 3.5L11.5 7.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconStop(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconChevronDown(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AiPanel(): JSX.Element {
  const {
    sessions,
    closedSessions,
    activeSessionId,
    isStreaming,
    isModelLoaded,
    modelName,
    sendMessage,
    sendAgentMessage,
    continueAgentRun,
    rollbackToUserMessage,
    editUserMessageAndResend,
    editChatUserMessage,
    stop,
    loadSessions,
    createSession,
    closeSession,
    restoreSession,
    setActiveSession,
    getActiveMessages,
    setModelStatus,
    agentPromptTokens,
    agentTodos,
    activePlan,
  } = useAiStore()
  const { modelManagerOpen, setModelManagerOpen, composerMode, setComposerMode } = useUiStore()
  const { current: workspace, refreshTree } = useWorkspaceStore()
  const [input, setInput] = useState('')
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const { tabs, activeTabId, cursorLine } = useEditorStore()
  const [models, setModels] = useState<ApiModelConfig[]>([])
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
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
  const [msgWindowStart, setMsgWindowStart] = useState(0)
  const [editTarget, setEditTarget] = useState<{ messageIndex: number; text: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    kind: 'rollback' | 'edit_resend'
    messageIndex: number
    editText?: string
    impact: RollbackImpact
  } | null>(null)

  const messages = getActiveMessages()
  const hiddenMessageCount = msgWindowStart
  const visibleMessages = useMemo(
    () =>
      messages.slice(msgWindowStart).map((message, offset) => ({
        message,
        index: msgWindowStart + offset,
      })),
    [messages, msgWindowStart]
  )
  const canSend = isModelLoaded && !isStreaming && (input.trim().length > 0 || attachedImages.length > 0)

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

  const loadModels = useCallback(async () => {
    const [list, settings] = await Promise.all([
      window.api.listModels(),
      window.api.getSettings(),
    ])
    setModels(list)
    setActiveModelId(settings.activeModelId)
  }, [])

  useEffect(() => { void loadSessions() }, [loadSessions])
  useEffect(() => { void loadModels() }, [loadModels])
  useEffect(() => {
    if (!modelManagerOpen) void loadModels()
  }, [modelManagerOpen, loadModels])

  useEffect(() => {
    setMsgWindowStart(Math.max(0, messages.length - MESSAGE_WINDOW))
    atBottomRef.current = true
  }, [activeSessionId])

  useEffect(() => {
    if (atBottomRef.current) {
      setMsgWindowStart(Math.max(0, messages.length - MESSAGE_WINDOW))
    }
  }, [messages.length])

  const scrollTailKey = useMemo(() => {
    const last = messages[messages.length - 1]
    if (!last) return ''
    const toolCount = last.agentSteps?.reduce((n, s) => n + s.tools.length, 0) ?? last.toolEvents?.length ?? 0
    return [
      last.content.length,
      last.agentReasoningBuffer?.length ?? 0,
      last.agentProseBuffer?.length ?? 0,
      last.agentStreamBuffer?.length ?? 0,
      toolCount,
      last.isStreaming ? 1 : 0,
    ].join('|')
  }, [messages])

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = messagesRef.current
    if (!el) return
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  useEffect(() => {
    if (!atBottomRef.current) return
    scrollToBottom(!isStreaming)
  }, [scrollTailKey, messages.length, activeSessionId, isStreaming, scrollToBottom])

  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (el.scrollTop < 120 && msgWindowStart > 0) {
      const prevHeight = el.scrollHeight
      setMsgWindowStart((start) => Math.max(0, start - 30))
      requestAnimationFrame(() => {
        const container = messagesRef.current
        if (!container) return
        container.scrollTop = container.scrollHeight - prevHeight + container.scrollTop
      })
    }
  }, [msgWindowStart])

  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      refreshTree()
    }
    prevStreaming.current = isStreaming
  }, [isStreaming, refreshTree])

  const adjustInputHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = `${INPUT_MIN_HEIGHT}px`
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)}px`
  }, [])

  useEffect(() => {
    adjustInputHeight()
  }, [input, adjustInputHeight])

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
    const agentModes = composerMode !== 'chat'
    return analyzeRollbackImpact(messages, messageIndex, scope, {
      workspacePath: workspace?.path ?? null,
      hasActivePlan: agentModes && Boolean(activePlan),
      todoCount: agentModes ? agentTodos.length : 0,
      planName: activePlan?.name,
    })
  }, [activePlan, agentTodos.length, composerMode, messages, workspace?.path])

  const executeRollback = useCallback((messageIndex: number) => {
    void rollbackToUserMessage(messageIndex, workspace?.path ?? null)
  }, [rollbackToUserMessage, workspace?.path])

  const executeEditResend = useCallback((messageIndex: number, text: string) => {
    if (composerMode === 'chat') {
      void editChatUserMessage(messageIndex, text, workspace?.path)
      return
    }
    void editUserMessageAndResend(messageIndex, text, workspace?.path, buildUserContext(), {
      mode: composerMode,
      sessionId: activeSessionId ?? undefined,
    })
  }, [
    activeSessionId,
    buildUserContext,
    composerMode,
    editChatUserMessage,
    editUserMessageAndResend,
    workspace?.path,
  ])

  const handleRollbackRequest = useCallback((messageIndex: number) => {
    const impact = buildRollbackImpact(messageIndex, 'rollback')
    if (!rollbackImpactHasChanges(impact)) {
      executeRollback(messageIndex)
      return
    }
    setConfirmAction({ kind: 'rollback', messageIndex, impact })
  }, [buildRollbackImpact, executeRollback])

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
    const text = input.trim()
    setInput('')

    const images = attachedImages.map(({ path, name, mimeType, base64 }) => ({
      path, name, mimeType, base64,
    }))
    const displayAttachments = attachedImages.map(({ name, mimeType, previewUrl, base64 }) => ({
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

    if (composerMode !== 'chat') {
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
    } else {
      await sendMessage(prompt, workspace?.path, sendOpts)
    }
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
              className={`${styles.chatTab} ${session.id === activeSessionId ? styles.chatTabActive : ''}`}
              onClick={() => setActiveSession(session.id)}
              title={session.title}
            >
              <span className={styles.chatTabIcon}><IconChatTab /></span>
              <span className={styles.chatTabTitle}>{session.title}</span>
              <button
                className={styles.chatTabClose}
                onClick={(e) => handleCloseTab(e, session.id)}
                title={t.closeChat}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button className={styles.newChatBtn} onClick={() => createSession()} title={t.newChat}>
          +
        </button>
        <div className={styles.historyWrap} ref={historyRef}>
          <button
            className={`${styles.historyBtn} ${historyOpen ? styles.historyBtnActive : ''}`}
            onClick={() => setHistoryOpen((v) => !v)}
            title={t.chatHistory}
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
                    title={t.restoreChat}
                  >
                    <span className={styles.historyItemTitle}>
                      <IconHistoryTitle />
                      <span className={styles.historyItemTitleText}>{session.title}</span>
                    </span>
                    <span className={styles.historyItemCount}>
                      <IconHistoryCount />
                      {countUserMessages(session.messages)}
                    </span>
                    <span className={styles.historyItemDate}>
                      <IconHistoryDate />
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

      <div
        ref={messagesRef}
        className={styles.messages}
        onScroll={handleMessagesScroll}
      >
        {hiddenMessageCount > 0 && (
          <button
            type="button"
            className={styles.loadEarlierBtn}
            onClick={() => setMsgWindowStart(0)}
          >
            {t.loadEarlierMessages(hiddenMessageCount)}
          </button>
        )}
        {visibleMessages.map(({ message, index }) => (
          <ChatMessage
            key={message.id}
            message={message}
            messageIndex={index}
            onRollback={handleRollbackRequest}
            onEditOpen={handleEditOpen}
            onImplementPlan={(path, name) => void handleImplementPlan(path, name)}
            onContinue={(messageId) => {
              void continueAgentRun(messageId, workspace?.path ?? null, buildUserContext())
            }}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.composerWrap}>
        <div className={styles.composerCap}>
          {agentTodos.length > 0 ? (
            <AgentTodoPanel todos={agentTodos} />
          ) : (
            <span className={styles.composerCapText}>{t.composerCapEmpty}</span>
          )}
        </div>

        <div className={styles.composer}>
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
                    title={t.deleteFile}
                    aria-label={t.deleteFile}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className={styles.composerInput}
            placeholder={isModelLoaded ? t.askPlaceholder : t.loadModelFirst}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => void handlePaste(e)}
            disabled={!isModelLoaded || isStreaming}
            rows={1}
          />

          <div className={styles.composerFooter}>
            <div className={styles.composerLeft}>
              <div className={styles.modeDropdownWrap} ref={modeDropdownRef}>
                <button
                  ref={modePillRef}
                  className={`${styles.modePill} ${composerModePillClass(composerMode)}`}
                  type="button"
                  onClick={() => setModeDropdownOpen((v) => !v)}
                  title={t.switchMode}
                >
                  <span className={styles.modeIcon}>{composerModeIcon(composerMode)}</span>
                  <span>{composerModeLabel(composerMode)}</span>
                  <IconChevronDown />
                </button>
                {modeDropdownOpen && modeDropdownPos && createPortal(
                  <div
                    ref={modeDropdownPortalRef}
                    className={styles.modeDropdownPortal}
                    style={{ left: modeDropdownPos.left, bottom: modeDropdownPos.bottom }}
                  >
                    {COMPOSER_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`${styles.modeOption} ${mode === composerMode ? styles.modeOptionActive : ''}`}
                        onClick={() => {
                          setComposerMode(mode)
                          setModeDropdownOpen(false)
                        }}
                      >
                        <span className={`${styles.modeOptionDot} ${composerModeDotClass(mode)}`} />
                        <span className={styles.modeOptionLabel}>{composerModeLabel(mode)}</span>
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
                  title={t.switchModel}
                >
                  <span className={styles.modelSelectorText}>
                    {modelName ?? t.noModelLoaded}
                  </span>
                  <IconChevronDown />
                </button>
                {modelDropdownOpen && modelDropdownPos && createPortal(
                  <div
                    ref={modelDropdownPortalRef}
                    className={styles.modelDropdownPortal}
                    style={{ left: modelDropdownPos.left, bottom: modelDropdownPos.bottom }}
                  >
                    {models.length === 0 ? (
                      <div className={styles.modelDropdownEmpty}>{t.noModelsConfigured}</div>
                    ) : (
                      models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`${styles.modelOption} ${m.id === activeModelId ? styles.modelOptionActive : ''}`}
                          onClick={() => void handleSwitchModel(m.id)}
                          disabled={switchingModelId !== null}
                        >
                          <span className={styles.modelOptionName}>{m.displayName}</span>
                          {switchingModelId === m.id && (
                            <span className={styles.modelOptionLoading}>…</span>
                          )}
                        </button>
                      ))
                    )}
                    <button
                      type="button"
                      className={styles.modelDropdownManage}
                      onClick={() => {
                        setModelDropdownOpen(false)
                        setModelManagerOpen(true)
                      }}
                    >
                      {t.manageModels}
                    </button>
                  </div>,
                  document.body
                )}
              </div>
            </div>

            <div className={styles.composerRight}>
              {isModelLoaded && (
                <ContextUsageRing
                  used={contextUsage.used}
                  total={contextUsage.total}
                  title={t.contextUsageTooltip(contextUsage.pct, contextUsage.used, contextUsage.total)}
                />
              )}
              <button
                className={`${styles.iconAction} ${styles.attachBtn}`}
                type="button"
                onClick={() => void pickImages()}
                disabled={!isModelLoaded || isStreaming}
                title={t.attachFile}
              >
                <IconAttach />
              </button>
              {isStreaming ? (
                <button className={`${styles.sendCircle} ${styles.sendCircleActive}`} type="button" onClick={stop} title={t.stop}>
                  <IconStop />
                </button>
              ) : (
                <button
                  className={`${styles.sendCircle} ${canSend ? styles.sendCircleActive : ''}`}
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  title={t.send}
                >
                  <IconSend />
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
