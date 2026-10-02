import { useCallback, useLayoutEffect, useRef } from 'react'

function isNearBottom(el: HTMLElement, threshold = 64): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

export function useChatAutoScroll(
  messagesRef: React.RefObject<HTMLDivElement | null>,
  scrollTailKey: string,
  activeSessionId: string | null,
) {
  const pinnedToBottomRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messagesRef])

  useLayoutEffect(() => {
    pinnedToBottomRef.current = true
    scrollToBottom()
  }, [activeSessionId, scrollToBottom])

  useLayoutEffect(() => {
    const el = messagesRef.current
    if (!el || !pinnedToBottomRef.current) return
    if (!isNearBottom(el)) {
      pinnedToBottomRef.current = false
      return
    }
    scrollToBottom()
  }, [scrollTailKey, scrollToBottom, messagesRef])

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      pinnedToBottomRef.current = isNearBottom(el)
    },
    [],
  )

  const pinToBottom = useCallback(() => {
    pinnedToBottomRef.current = true
    scrollToBottom()
  }, [scrollToBottom])

  return { handleScroll, scrollToBottom, pinToBottom }
}
