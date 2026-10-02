import type { GenerateOptions, ApiModelConfig, ChatMessage, ImageAttachment } from '../../shared/types'
import { AgentAbortedError } from '../../shared/agent/errors'
import {
  buildChatCompletionPayload,
  resolveOutputReserveTokens,
} from '../../shared/chatCompletionPayload'
import { MODEL_CONTEXT_DEFAULT_K, contextKToTokens } from '../../shared/modelConfig'
import { SYSTEM_PROMPT } from '../../shared/systemPrompt'
import { modelRegistryService } from './ModelRegistryService'
import { settingsService } from './SettingsService'
import { buildAuthHeaders } from './apiAuth'
import type { AgentChatMessage, AgentStreamResult } from '../../shared/agent/agentChatMessages'
import {
  applyStreamDelta,
  applyStreamFinishReason,
  createStreamCompletionState,
  finalizeNativeToolCalls,
} from '../../shared/agent/nativeToolCalls'
import {
  headersToRecord,
  logLlmRequest,
  logLlmResponse,
  logLlmStreamResponse,
} from './llmApiDebugLog'

type ChatRole = 'system' | 'user' | 'assistant'

function createAbortGuard(opts: GenerateOptions) {
  const controller = new AbortController()
  const check = (): boolean => {
    if (opts.isAborted?.()) {
      controller.abort()
      return true
    }
    return false
  }
  return { controller, check }
}

function rethrowIfAborted(err: unknown): never {
  if (err instanceof AgentAbortedError) throw err
  if (err instanceof Error && err.name === 'AbortError') {
    throw new AgentAbortedError()
  }
  throw err
}

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface ChatApiMessage {
  role: ChatRole
  content: string | ChatContentPart[]
}

export type CompletionUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type StreamDeltaJson = {
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: Array<{
    index?: number
    id?: string
    type?: string
    function?: { name?: string; arguments?: string }
  }>
}

type StreamChunkJson = {
  choices?: Array<{
    delta?: StreamDeltaJson
    message?: { content?: string }
    finish_reason?: string | null
  }>
  error?: { message?: string }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

function parseStreamUsage(json: StreamChunkJson): CompletionUsage | null {
  const u = json.usage
  if (!u) return null
  const prompt = u.prompt_tokens ?? 0
  const completion = u.completion_tokens ?? 0
  const total = u.total_tokens ?? prompt + completion
  if (prompt === 0 && completion === 0 && total === 0) return null
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total }
}

function buildUserContent(prompt: string, images?: ImageAttachment[]): string | ChatContentPart[] {
  if (!images?.length) return prompt

  const parts: ChatContentPart[] = []
  const pdfNames: string[] = []

  for (const img of images) {
    if (img.mimeType.startsWith('image/')) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      })
    } else if (img.mimeType === 'application/pdf') {
      pdfNames.push(img.name)
    }
  }

  let text = prompt
  if (pdfNames.length > 0) {
    text += `\n\n[Прикреплённые PDF: ${pdfNames.join(', ')}]`
  }

  parts.push({ type: 'text', text })
  return parts
}

function resolveChatUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

function estimateTokens(content: string | ChatContentPart[]): number {
  if (typeof content === 'string') return Math.ceil(content.length / 4)
  return content.reduce((sum, part) => {
    if (part.type === 'text') return sum + Math.ceil(part.text.length / 4)
    return sum + 512
  }, 0)
}

function estimateAgentMessageTokens(msg: AgentChatMessage): number {
  if (msg.role === 'system') return Math.ceil(msg.content.length / 4)
  if (msg.role === 'user') return estimateTokens(msg.content as string | ChatContentPart[])
  if (msg.role === 'assistant') {
    let n = msg.content ? Math.ceil(String(msg.content).length / 4) : 0
    if (msg.tool_calls?.length) n += Math.ceil(JSON.stringify(msg.tool_calls).length / 4)
    return n
  }
  if (msg.role === 'tool') {
    const text = msg.content.map((p) => p.text).join('')
    return Math.ceil(text.length / 4)
  }
  return 0
}

function isBootstrapUserMessage(msg: AgentChatMessage): boolean {
  if (msg.role !== 'user') return false
  const content = msg.content
  const text = typeof content === 'string'
    ? content
    : content.map((p) => ('text' in p ? p.text : '')).join('')
  return text.includes('<user_info>')
}

function trimAgentHistory(
  history: AgentChatMessage[],
  contextSize: number,
  outputReserve: number
): AgentChatMessage[] {
  if (history.length === 0) return history

  const system = history[0]?.role === 'system' ? history[0] : null
  const bootstrap = history[1]?.role === 'user' && isBootstrapUserMessage(history[1]) ? history[1] : null
  const pinned = [system, bootstrap].filter(Boolean) as AgentChatMessage[]
  const pinnedCost = pinned.reduce((sum, msg) => sum + estimateAgentMessageTokens(msg), 0)
  const rest = history.slice(pinned.length)
  let budget = contextSize - pinnedCost - outputReserve
  if (budget <= 0) return pinned

  const kept: AgentChatMessage[] = []
  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i]
    const cost = estimateAgentMessageTokens(msg)
    if (cost > budget && kept.length > 0) break
    if (cost > budget) continue
    kept.unshift(msg)
    budget -= cost
  }

  return [...pinned, ...kept]
}

function trimHistory(history: ChatApiMessage[], contextSize: number, outputReserve: number): ChatApiMessage[] {
  if (history.length === 0) return history

  const system = history[0]?.role === 'system' ? history[0] : null
  const rest = system ? history.slice(1) : [...history]
  let budget = contextSize - (system ? estimateTokens(system.content) : 0) - outputReserve
  if (budget <= 0) return system ? [system] : []

  const kept: ChatApiMessage[] = []
  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i]
    const cost = estimateTokens(msg.content)
    if (cost > budget && kept.length > 0) break
    if (cost > budget) continue
    kept.unshift(msg)
    budget -= cost
  }

  return system ? [system, ...kept] : kept
}

class LlmService {
  private activeModelId: string | null = null
  private history: ChatApiMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  private lastCompletionUsage: CompletionUsage | null = null

  isLoaded = false

  getLastCompletionUsage(): CompletionUsage | null {
    return this.lastCompletionUsage
  }

  /** Всегда читает актуальный конфиг из settings (токен, URL и т.д.). */
  private getConfig(): ApiModelConfig {
    if (!this.activeModelId) throw new Error('Модель не загружена')
    const model = modelRegistryService.getById(this.activeModelId)
    if (!model) throw new Error('Модель не найдена')
    if (!model.url.trim()) throw new Error('URL модели не указан')
    if (!model.modelName.trim()) throw new Error('Имя модели не указано')
    return model
  }

  async loadModel(modelId: string): Promise<void> {
    const model = modelRegistryService.getById(modelId)
    if (!model) throw new Error('Модель не найдена')
    if (!model.url.trim()) throw new Error('URL модели не указан')
    if (!model.modelName.trim()) throw new Error('Имя модели не указано')

    this.activeModelId = modelId
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }]
    this.isLoaded = true
    settingsService.set('activeModelId', modelId)
  }

  async *generate(
    prompt: string,
    opts: GenerateOptions = {},
    onAbort?: (cb: () => void) => void
  ): AsyncGenerator<string> {
    const config = this.getConfig()

    this.history.push({ role: 'user', content: buildUserContent(prompt, opts.images) })

    const abortController = new AbortController()
    onAbort?.(() => abortController.abort())

    const url = resolveChatUrl(config.url)
    const authType = config.authType === 'auto'
      ? (config.token ? 'auto' : 'none')
      : (config.authType ?? 'none')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(config.token, authType),
    }

    const outputReserve = resolveOutputReserveTokens(config, opts.maxTokens)
    const contextTokens = contextKToTokens(config.contextSize ?? MODEL_CONTEXT_DEFAULT_K)
    const messages = trimHistory(this.history, contextTokens, outputReserve)
    const payload = buildChatCompletionPayload(config, messages, true, {
      maxTokensOverride: opts.maxTokens,
      stopSequences: opts.stopSequences,
    })
    const reqId = logLlmRequest({ label: 'generate', url, headers, body: payload })

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: abortController.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      logLlmResponse({
        id: reqId,
        label: 'generate',
        status: response.status,
        headers: headersToRecord(response.headers),
        error: errText,
      })
      throw new Error(`HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`)
    }

    const respHeaders = headersToRecord(response.headers)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream') && !contentType.includes('application/x-ndjson')) {
      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }
      logLlmResponse({ id: reqId, label: 'generate', status: response.status, headers: respHeaders, body: json })
      if (json.error?.message) throw new Error(json.error.message)
      const text = json.choices?.[0]?.message?.content ?? ''
      if (text) {
        this.history.push({ role: 'assistant', content: text })
        yield text
      }
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let assistantText = ''
    let reasoningText = ''
    let streamRaw = ''
    const parsedChunks: unknown[] = []
    const streamState = createStreamCompletionState()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunkText = decoder.decode(value, { stream: true })
        streamRaw += chunkText
        buffer += chunkText
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue

          let payloadLine = trimmed
          if (payloadLine.startsWith('data:')) payloadLine = payloadLine.slice(5).trim()
          if (payloadLine === '[DONE]') continue

          try {
            const json = JSON.parse(payloadLine) as StreamChunkJson
            parsedChunks.push(json)
            if (json.error?.message) throw new Error(json.error.message)
            const usage = parseStreamUsage(json)
            if (usage) this.lastCompletionUsage = usage
            const choice = json.choices?.[0]
            applyStreamFinishReason(streamState, choice?.finish_reason)
            applyStreamDelta(streamState, choice?.delta)
            const chunk = choice?.delta?.content ?? choice?.message?.content ?? ''
            if (chunk) {
              assistantText += chunk
              yield chunk
            }
            const reasoning = choice?.delta?.reasoning_content
            if (reasoning) reasoningText += reasoning
          } catch (err) {
            if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err
          }
        }
      }
    } finally {
      reader.releaseLock()
      logLlmStreamResponse({
        id: reqId,
        label: 'generate',
        status: response.status,
        headers: respHeaders,
        streamText: streamRaw,
        assistantText,
        reasoningText,
        usage: this.lastCompletionUsage,
        parsedChunks,
        finishReason: streamState.finishReason,
      })
    }

    if (assistantText) {
      this.history.push({ role: 'assistant', content: assistantText })
    } else if (abortController.signal.aborted) {
      this.history.pop()
    }
  }

  clearHistory(): void {
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }]
  }

  restoreHistory(messages: ChatMessage[]): void {
    this.history = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
        .filter((m) => !m.isStreaming && m.content.trim())
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]
  }

  async unload(): Promise<void> {
    this.activeModelId = null
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }]
    this.isLoaded = false
    settingsService.set('activeModelId', null)
  }

  getModelDisplayName(): string | null {
    if (!this.activeModelId) return null
    return modelRegistryService.getById(this.activeModelId)?.displayName ?? null
  }

  tryRestoreActiveModel(): void {
    if (this.isLoaded) return
    const activeId = settingsService.get('activeModelId')
    if (!activeId) return
    if (!modelRegistryService.getById(activeId)) return
    this.activeModelId = activeId
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }]
    this.isLoaded = true
  }

  /** One-shot completion for agent loop — does not mutate chat history. */
  async completeMessages(
    messages: ChatApiMessage[],
    opts: GenerateOptions = {}
  ): Promise<string> {
    const config = this.getConfig()
    const url = resolveChatUrl(config.url)
    const authType = config.authType === 'auto'
      ? (config.token ? 'auto' : 'none')
      : (config.authType ?? 'none')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(config.token, authType)
    }

    let imagesAttached = false
    const withImages = messages.map((m) => {
      if (!imagesAttached && m.role === 'user' && opts.images?.length) {
        imagesAttached = true
        const text = typeof m.content === 'string' ? m.content : ''
        return { role: m.role, content: buildUserContent(text, opts.images) }
      }
      return m
    })

    const outputReserve = resolveOutputReserveTokens(config, opts.maxTokens)
    const contextTokens = contextKToTokens(config.contextSize ?? MODEL_CONTEXT_DEFAULT_K)
    const trimmed = trimHistory(withImages, contextTokens, outputReserve)
    const payload = buildChatCompletionPayload(config, trimmed, false, {
      maxTokensOverride: opts.maxTokens,
      stopSequences: opts.stopSequences,
    })
    const reqId = logLlmRequest({ label: 'completeMessages', url, headers, body: payload })

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      logLlmResponse({
        id: reqId,
        label: 'completeMessages',
        status: response.status,
        headers: headersToRecord(response.headers),
        error: errText,
      })
      throw new Error(`HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`)
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    logLlmResponse({
      id: reqId,
      label: 'completeMessages',
      status: response.status,
      headers: headersToRecord(response.headers),
      body: json,
    })
    if (json.error?.message) throw new Error(json.error.message)
    return json.choices?.[0]?.message?.content ?? ''
  }

  /** Streaming one-shot completion for agent loop — does not mutate chat history. */
  async completeMessagesStream(
    messages: ChatApiMessage[],
    opts: GenerateOptions & { onToken?: (token: string) => void } = {}
  ): Promise<string> {
    const config = this.getConfig()
    const url = resolveChatUrl(config.url)
    const authType = config.authType === 'auto'
      ? (config.token ? 'auto' : 'none')
      : (config.authType ?? 'none')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(config.token, authType),
    }

    let imagesAttached = false
    const withImages = messages.map((m) => {
      if (!imagesAttached && m.role === 'user' && opts.images?.length) {
        imagesAttached = true
        const text = typeof m.content === 'string' ? m.content : ''
        return { role: m.role, content: buildUserContent(text, opts.images) }
      }
      return m
    })

    const outputReserve = resolveOutputReserveTokens(config, opts.maxTokens)
    const contextTokens = contextKToTokens(config.contextSize ?? MODEL_CONTEXT_DEFAULT_K)
    const trimmed = trimHistory(withImages, contextTokens, outputReserve)
    const payload = buildChatCompletionPayload(config, trimmed, true, {
      maxTokensOverride: opts.maxTokens,
      stopSequences: opts.stopSequences,
    })
    const reqId = logLlmRequest({ label: 'completeMessagesStream', url, headers, body: payload })
    const { controller, check } = createAbortGuard(opts)
    if (check()) throw new AgentAbortedError()

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (err) {
      rethrowIfAborted(err)
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      logLlmResponse({
        id: reqId,
        label: 'completeMessagesStream',
        status: response.status,
        headers: headersToRecord(response.headers),
        error: errText,
      })
      throw new Error(`HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`)
    }

    const respHeaders = headersToRecord(response.headers)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream') && !contentType.includes('application/x-ndjson')) {
      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }
      logLlmResponse({
        id: reqId,
        label: 'completeMessagesStream',
        status: response.status,
        headers: respHeaders,
        body: json,
      })
      if (json.error?.message) throw new Error(json.error.message)
      const text = json.choices?.[0]?.message?.content ?? ''
      if (text) opts.onToken?.(text)
      return text
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let assistantText = ''
    let reasoningText = ''
    let streamRaw = ''
    const parsedChunks: unknown[] = []
    const streamState = createStreamCompletionState()

    try {
      while (true) {
        if (check()) {
          await reader.cancel().catch(() => {})
          throw new AgentAbortedError()
        }
        const { done, value } = await reader.read()
        if (done) break

        const chunkText = decoder.decode(value, { stream: true })
        streamRaw += chunkText
        buffer += chunkText
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || trimmedLine.startsWith(':')) continue

          let payloadLine = trimmedLine
          if (payloadLine.startsWith('data:')) payloadLine = payloadLine.slice(5).trim()
          if (payloadLine === '[DONE]') continue

          try {
            const json = JSON.parse(payloadLine) as StreamChunkJson
            parsedChunks.push(json)
            if (json.error?.message) throw new Error(json.error.message)
            const usage = parseStreamUsage(json)
            if (usage) this.lastCompletionUsage = usage
            const choice = json.choices?.[0]
            applyStreamFinishReason(streamState, choice?.finish_reason)
            applyStreamDelta(streamState, choice?.delta)
            const chunk = choice?.delta?.content ?? choice?.message?.content ?? ''
            if (chunk) {
              assistantText += chunk
              opts.onToken?.(chunk)
            }
            const reasoning = choice?.delta?.reasoning_content
            if (reasoning) {
              reasoningText += reasoning
              opts.onReasoningToken?.(reasoning)
            }
          } catch (err) {
            if (err instanceof AgentAbortedError) throw err
            if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err
          }
        }
      }
    } catch (err) {
      rethrowIfAborted(err)
    } finally {
      reader.releaseLock()
      logLlmStreamResponse({
        id: reqId,
        label: 'completeMessagesStream',
        status: response.status,
        headers: respHeaders,
        streamText: streamRaw,
        assistantText,
        reasoningText,
        usage: this.lastCompletionUsage,
        parsedChunks,
        finishReason: streamState.finishReason,
      })
    }

    return assistantText
  }

  /** Native-tools agent stream — returns structured assistant message + tool_calls. */
  async completeAgentStream(
    messages: AgentChatMessage[],
    opts: GenerateOptions & {
      onToken?: (token: string) => void
      /** Fires once when reasoning_content ends (content/tool_calls follow). */
      onReasoningComplete?: (reasoning: string) => void
    } = {}
  ): Promise<AgentStreamResult> {
    const config = this.getConfig()
    const url = resolveChatUrl(config.url)
    const authType = config.authType === 'auto'
      ? (config.token ? 'auto' : 'none')
      : (config.authType ?? 'none')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(config.token, authType),
    }

    let withImages = messages
    if (opts.images?.length) {
      let turnIdx = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role === 'user' && !isBootstrapUserMessage(m)) {
          turnIdx = i
          break
        }
      }
      if (turnIdx >= 0) {
        withImages = messages.map((m, i) => {
          if (i !== turnIdx || m.role !== 'user') return m
          const text = typeof m.content === 'string'
            ? m.content
            : m.content.filter((p) => p.type === 'text').map((p) => p.text).join('')
          return { ...m, content: buildUserContent(text, opts.images!) }
        })
      }
    }

    const outputReserve = resolveOutputReserveTokens(config, opts.maxTokens)
    const contextTokens = contextKToTokens(config.contextSize ?? MODEL_CONTEXT_DEFAULT_K)
    const trimmed = trimAgentHistory(withImages, contextTokens, outputReserve)
    const payload = buildChatCompletionPayload(config, trimmed, true, {
      maxTokensOverride: opts.maxTokens,
      stopSequences: opts.stopSequences,
      tools: opts.tools,
    })
    const reqId = logLlmRequest({ label: 'completeAgentStream', url, headers, body: payload })
    const { controller, check } = createAbortGuard(opts)
    if (check()) throw new AgentAbortedError()

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (err) {
      rethrowIfAborted(err)
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      logLlmResponse({
        id: reqId,
        label: 'completeAgentStream',
        status: response.status,
        headers: headersToRecord(response.headers),
        error: errText,
      })
      throw new Error(`HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`)
    }

    const respHeaders = headersToRecord(response.headers)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream') && !contentType.includes('application/x-ndjson')) {
      const json = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string | null
            tool_calls?: AgentStreamResult['toolCalls']
          }
          finish_reason?: string | null
        }>
        error?: { message?: string }
      }
      logLlmResponse({
        id: reqId,
        label: 'completeAgentStream',
        status: response.status,
        headers: respHeaders,
        body: json,
      })
      if (json.error?.message) throw new Error(json.error.message)
      const msg = json.choices?.[0]?.message
      const toolCalls = msg?.tool_calls ?? []
      const content = msg?.content ?? ''
      if (content) opts.onToken?.(typeof content === 'string' ? content : '')
      const assistantMessage: AgentChatMessage = {
        role: 'assistant',
        content: content || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      }
      return {
        content: typeof content === 'string' ? content : '',
        reasoningContent: '',
        toolCalls,
        finishReason: json.choices?.[0]?.finish_reason ?? null,
        assistantMessage,
      }
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let streamRaw = ''
    const parsedChunks: unknown[] = []
    const streamState = createStreamCompletionState()
    let reasoningCompleteEmitted = false
    const emitReasoningComplete = (): void => {
      if (reasoningCompleteEmitted) return
      const text = streamState.reasoningContent.trim()
      if (!text) return
      reasoningCompleteEmitted = true
      opts.onReasoningComplete?.(streamState.reasoningContent)
    }

    try {
      while (true) {
        if (check()) {
          await reader.cancel().catch(() => {})
          throw new AgentAbortedError()
        }
        const { done, value } = await reader.read()
        if (done) break

        const chunkText = decoder.decode(value, { stream: true })
        streamRaw += chunkText
        buffer += chunkText
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || trimmedLine.startsWith(':')) continue

          let payloadLine = trimmedLine
          if (payloadLine.startsWith('data:')) payloadLine = payloadLine.slice(5).trim()
          if (payloadLine === '[DONE]') continue

          try {
            const json = JSON.parse(payloadLine) as StreamChunkJson
            parsedChunks.push(json)
            if (json.error?.message) throw new Error(json.error.message)
            const usage = parseStreamUsage(json)
            if (usage) this.lastCompletionUsage = usage
            const choice = json.choices?.[0]
            applyStreamFinishReason(streamState, choice?.finish_reason)
            applyStreamDelta(streamState, choice?.delta)
            if (choice?.delta?.tool_calls?.length) {
              emitReasoningComplete()
              opts.onToolCallDelta?.(
                streamState.toolCallAcc.map((tc, index) => ({
                  index,
                  id: tc.id || undefined,
                  name: tc.function.name || undefined,
                  argumentsPartial: tc.function.arguments,
                }))
              )
            }
            const chunk = choice?.delta?.content ?? ''
            if (chunk) {
              emitReasoningComplete()
              opts.onToken?.(chunk)
            }
            const reasoning = choice?.delta?.reasoning_content
            if (reasoning) opts.onReasoningToken?.(reasoning)
          } catch (err) {
            if (err instanceof AgentAbortedError) throw err
            if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err
          }
        }
      }
    } catch (err) {
      rethrowIfAborted(err)
    } finally {
      reader.releaseLock()
      const toolCalls = finalizeNativeToolCalls(streamState)
      logLlmStreamResponse({
        id: reqId,
        label: 'completeAgentStream',
        status: response.status,
        headers: respHeaders,
        streamText: streamRaw,
        assistantText: streamState.content,
        reasoningText: streamState.reasoningContent,
        usage: this.lastCompletionUsage,
        parsedChunks,
        toolCalls,
        finishReason: streamState.finishReason,
      })
    }

    emitReasoningComplete()

    const toolCalls = finalizeNativeToolCalls(streamState)
    const assistantMessage: AgentChatMessage = {
      role: 'assistant',
      content: streamState.content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    }
    return {
      content: streamState.content,
      reasoningContent: streamState.reasoningContent,
      toolCalls,
      finishReason: streamState.finishReason,
      assistantMessage,
    }
  }
}

export const llmService = new LlmService()
