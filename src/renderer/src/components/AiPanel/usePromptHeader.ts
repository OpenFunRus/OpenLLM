import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const SHOW_COPY_LEAD_PX = 6
const HIDE_COPY_LAG_PX = 10

function pickHeaderTurn(
  activeTurnIndex: number,
  edge: number,
  promptAnchorRefs: React.RefObject<Map<number, HTMLDivElement>>,
): number {
  let header = 0
  for (let i = 0; i <= activeTurnIndex; i++) {
    const prompt = promptAnchorRefs.current?.get(i)
    if (!prompt) continue
    if (prompt.getBoundingClientRect().top <= edge) header = i
  }
  return header
}

function shouldShowHeaderCopy(
  promptTop: number,
  containerTop: number,
  previous: boolean,
): boolean {
  if (promptTop < containerTop + SHOW_COPY_LEAD_PX) return true
  if (promptTop > containerTop + HIDE_COPY_LAG_PX) return false
  return previous
}

export function usePromptHeader(
  activeTurnIndex: number,
  messagesRef: React.RefObject<HTMLDivElement | null>,
  promptAnchorRefs: React.RefObject<Map<number, HTMLDivElement>>,
  scrollTailKey: string,
) {
  const [headerTurnIndex, setHeaderTurnIndex] = useState(activeTurnIndex)
  const [showHeaderCopy, setShowHeaderCopy] = useState(false)
  const showHeaderCopyRef = useRef(false)

  const syncHeaderCopyVisibility = useCallback(
    (header: number) => {
      const container = messagesRef.current
      const headerPrompt = promptAnchorRefs.current?.get(header)
      if (!container || !headerPrompt) {
        showHeaderCopyRef.current = false
        setShowHeaderCopy(false)
        return
      }

      const containerTop = container.getBoundingClientRect().top
      const promptTop = headerPrompt.getBoundingClientRect().top
      const next = shouldShowHeaderCopy(promptTop, containerTop, showHeaderCopyRef.current)
      showHeaderCopyRef.current = next
      setShowHeaderCopy(next)
    },
    [messagesRef, promptAnchorRefs],
  )

  const syncHeaderFromScroll = useCallback(() => {
    const container = messagesRef.current
    if (!container) return

    const edge = container.getBoundingClientRect().top + 8
    const header = pickHeaderTurn(activeTurnIndex, edge, promptAnchorRefs)
    setHeaderTurnIndex(header)
    syncHeaderCopyVisibility(header)
  }, [activeTurnIndex, messagesRef, promptAnchorRefs, syncHeaderCopyVisibility])

  useLayoutEffect(() => {
    syncHeaderFromScroll()
  }, [activeTurnIndex, scrollTailKey, syncHeaderFromScroll])

  useEffect(() => {
    const root = messagesRef.current
    const prompt = promptAnchorRefs.current?.get(headerTurnIndex)
    if (!root || !prompt) return

    const update = () => syncHeaderCopyVisibility(headerTurnIndex)

    const observer = new IntersectionObserver(update, {
      root,
      threshold: [0, 0.01, 0.25, 0.5, 0.75, 1],
    })
    observer.observe(prompt)
    update()

    return () => observer.disconnect()
  }, [headerTurnIndex, scrollTailKey, messagesRef, promptAnchorRefs, syncHeaderCopyVisibility])

  return { headerTurnIndex, showHeaderCopy, syncHeaderFromScroll }
}
