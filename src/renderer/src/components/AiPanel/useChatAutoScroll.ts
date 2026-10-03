import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** px from bottom — user scroll within this band keeps auto-follow enabled */
const PIN_THRESHOLD_PX = 96

function isNearBottom(el: HTMLElement, threshold = PIN_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

export function useChatAutoScroll(
  messagesRef: React.RefObject<HTMLDivElement | null>,
  bottomAnchorRef: React.RefObject<HTMLDivElement | null>,
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

  // Content grew while pinned — always follow (do not unpin because growth pushed us up).
  useLayoutEffect(() => {
    if (!pinnedToBottomRef.current) return
    scrollToBottom()
  }, [scrollTailKey, scrollToBottom])

  // Tool bubbles / diffs resize without changing scrollTailKey — keep tail in view when pinned.
  useEffect(() => {
    const root = messagesRef.current
    const anchor = bottomAnchorRef.current
    if (!root || !anchor) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry || entry.isIntersecting) return
        if (pinnedToBottomRef.current) scrollToBottom()
      },
      { root, threshold: 0 },
    )
    io.observe(anchor)
    return () => io.disconnect()
  }, [messagesRef, bottomAnchorRef, scrollToBottom, activeSessionId])

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
