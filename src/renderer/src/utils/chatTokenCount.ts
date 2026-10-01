import { Tiktoken } from 'js-tiktoken/lite'
import cl100k_base from 'js-tiktoken/ranks/cl100k_base'
import type { ChatMessage, ChatMessageAttachment } from '@shared/types'
import { SYSTEM_PROMPT } from '@shared/systemPrompt'

/** Оценка токенов на изображение (vision, low detail). */
const IMAGE_TOKEN_ESTIMATE = 765
const MESSAGE_OVERHEAD = 4

let encoder: Tiktoken | null = null

function getEncoder(): Tiktoken {
  if (!encoder) encoder = new Tiktoken(cl100k_base)
  return encoder
}

export function countTextTokens(text: string): number {
  if (!text) return 0
  return getEncoder().encode(text).length
}

function countAttachments(attachments?: ChatMessageAttachment[]): number {
  if (!attachments?.length) return 0
  return attachments.reduce((sum, att) => {
    if (att.mimeType.startsWith('image/')) return sum + IMAGE_TOKEN_ESTIMATE
    return sum + countTextTokens(`[PDF: ${att.name}]`)
  }, 0)
}

export function countChatContextTokens(
  messages: ChatMessage[],
  draftInput: string,
  draftImages: { mimeType: string; name: string }[],
): number {
  let total = countTextTokens(SYSTEM_PROMPT) + MESSAGE_OVERHEAD

  for (const msg of messages) {
    if (msg.isStreaming && !msg.content.trim()) continue
    total += MESSAGE_OVERHEAD + countTextTokens(msg.content)
    total += countAttachments(msg.attachments)
  }

  const draftImagesCount = draftImages.filter((f) => f.mimeType.startsWith('image/')).length
  const draftPdfNames = draftImages
    .filter((f) => f.mimeType === 'application/pdf')
    .map((f) => f.name)

  if (draftInput.trim() || draftImagesCount > 0 || draftPdfNames.length > 0) {
    total += MESSAGE_OVERHEAD + countTextTokens(draftInput)
    total += draftImagesCount * IMAGE_TOKEN_ESTIMATE
    if (draftPdfNames.length > 0) {
      total += countTextTokens(`\n\n[Прикреплённые PDF: ${draftPdfNames.join(', ')}]`)
    }
  }

  return total
}
