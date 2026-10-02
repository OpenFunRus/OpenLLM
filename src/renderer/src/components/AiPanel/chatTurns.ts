import type { ChatMessage } from '@shared/types'

export type ChatTurn = {
  turnIndex: number
  userIndex: number
  messageIndices: number[]
  userMessage: ChatMessage
  replyMessages: ChatMessage[]
}

export function splitChatTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  let i = 0
  while (i < messages.length) {
    if (messages[i].role !== 'user') {
      i++
      continue
    }
    const userIndex = i
    const messageIndices = [i]
    i++
    while (i < messages.length && messages[i].role !== 'user') {
      messageIndices.push(i)
      i++
    }
    turns.push({
      turnIndex: turns.length,
      userIndex,
      messageIndices,
      userMessage: messages[userIndex],
      replyMessages: messageIndices.slice(1).map((idx) => messages[idx]),
    })
  }
  return turns
}
