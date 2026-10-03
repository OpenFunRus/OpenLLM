import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './TooltipLayer.module.css'

const SHOW_DELAY_MS = 400
const HIDE_DELAY_MS = 64
const LONG_TEXT_THRESHOLD = 48

interface TooltipState {
  text: string
  left: number
  top: number
}

function findTooltipHost(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const el = node.closest('[data-tooltip]')
  return el instanceof HTMLElement ? el : null
}

function stripNativeTitle(el: HTMLElement): void {
  const text = el.getAttribute('title')?.trim()
  if (text && !el.getAttribute('data-tooltip')?.trim()) {
    el.setAttribute('data-tooltip', text)
  }
  if (el.hasAttribute('title')) {
    el.removeAttribute('title')
  }
}

function stripNativeTitlesIn(root: ParentNode): void {
  if (root instanceof HTMLElement) stripNativeTitle(root)
  root.querySelectorAll<HTMLElement>('[title]').forEach(stripNativeTitle)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function measureTooltip(text: string, wrap: boolean): { width: number; height: number } {
  const el = document.createElement('div')
  el.className = wrap ? `${styles.tooltip} ${styles.tooltipWrap}` : styles.tooltip
  el.style.position = 'fixed'
  el.style.left = '-9999px'
  el.style.top = '-9999px'
  el.style.visibility = 'hidden'
  el.textContent = text
  document.body.appendChild(el)
  const rect = el.getBoundingClientRect()
  document.body.removeChild(el)
  return { width: rect.width, height: rect.height }
}

function computePosition(anchor: DOMRect, tipWidth: number, tipHeight: number): { left: number; top: number } {
  const margin = 8
  const gap = 6

  let top = anchor.bottom + gap
  let left = anchor.left + anchor.width / 2

  left = clamp(left, margin + tipWidth / 2, window.innerWidth - margin - tipWidth / 2)

  if (top + tipHeight > window.innerHeight - margin) {
    top = anchor.top - gap - tipHeight
  }

  return { left, top }
}

function tooltipPosition(el: HTMLElement, text: string): TooltipState {
  const anchor = el.getBoundingClientRect()
  const wrap = text.length > LONG_TEXT_THRESHOLD
  const { width, height } = measureTooltip(text, wrap)
  const { left, top } = computePosition(anchor, width, height)
  return { text, left, top }
}

export function TooltipLayer(): JSX.Element | null {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const activeTargetRef = useRef<HTMLElement | null>(null)
  const pendingTargetRef = useRef<HTMLElement | null>(null)
  const pendingTextRef = useRef<string | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipVisibleRef = useRef(false)
  const pointerRef = useRef({ x: 0, y: 0 })
  const refreshRafRef = useRef(0)

  const hostAtPointer = (): HTMLElement | null =>
    findTooltipHost(document.elementFromPoint(pointerRef.current.x, pointerRef.current.y))

  const clearPending = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
    pendingTargetRef.current = null
    pendingTextRef.current = null
  }

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const hideTooltip = () => {
    clearHideTimer()
    clearPending()
    activeTargetRef.current = null
    tooltipVisibleRef.current = false
    setTooltip(null)
  }

  const paintTooltip = (el: HTMLElement, text: string) => {
    activeTargetRef.current = el
    tooltipVisibleRef.current = true
    setTooltip(tooltipPosition(el, text))
  }

  const scheduleRefresh = () => {
    cancelAnimationFrame(refreshRafRef.current)
    refreshRafRef.current = requestAnimationFrame(() => {
      if (!tooltipVisibleRef.current && !showTimerRef.current) return

      const host = hostAtPointer()
      if (!host) {
        if (!showTimerRef.current) hideTooltip()
        return
      }

      const text = host.getAttribute('data-tooltip')?.trim()
      if (!text) {
        hideTooltip()
        return
      }

      if (tooltipVisibleRef.current) {
        paintTooltip(host, text)
        return
      }

      if (showTimerRef.current && pendingTextRef.current === text) {
        pendingTargetRef.current = host
      }
    })
  }

  useEffect(() => {
    stripNativeTitlesIn(document.body)

    const observer = new MutationObserver((mutations) => {
      let needsRefresh = false
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes'
          && mutation.attributeName === 'title'
          && mutation.target instanceof HTMLElement
        ) {
          stripNativeTitle(mutation.target)
        }
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) stripNativeTitlesIn(node)
          })
          if (tooltipVisibleRef.current || showTimerRef.current) {
            needsRefresh = true
          }
        }
      }
      if (needsRefresh) scheduleRefresh()
    })
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['title'],
      childList: true,
    })

    const scheduleShow = (el: HTMLElement, text: string) => {
      clearPending()
      pendingTargetRef.current = el
      pendingTextRef.current = text
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null
        pendingTargetRef.current = null
        pendingTextRef.current = null

        const host = hostAtPointer()
        if (!host) return
        const liveText = host.getAttribute('data-tooltip')?.trim()
        if (!liveText) return
        paintTooltip(host, liveText)
      }, SHOW_DELAY_MS)
    }

    const onPointerMove = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }

    const onMouseOver = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      clearHideTimer()

      const el = findTooltipHost(event.target)
      if (!el) return

      const text = el.getAttribute('data-tooltip')?.trim()
      if (!text) return

      if (tooltipVisibleRef.current && activeTargetRef.current?.getAttribute('data-tooltip') === text) {
        if (activeTargetRef.current !== el) paintTooltip(el, text)
        return
      }

      if (showTimerRef.current && pendingTextRef.current === text) {
        pendingTargetRef.current = el
        return
      }

      if (activeTargetRef.current && activeTargetRef.current !== el) {
        hideTooltip()
      }

      scheduleShow(el, text)
    }

    const onMouseOut = () => {
      clearHideTimer()
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null
        const host = hostAtPointer()
        if (!host) {
          hideTooltip()
          return
        }

        const text = host.getAttribute('data-tooltip')?.trim()
        if (!text) {
          hideTooltip()
          return
        }

        if (tooltipVisibleRef.current) {
          if (activeTargetRef.current !== host) paintTooltip(host, text)
          return
        }

        if (showTimerRef.current && pendingTextRef.current === text) {
          pendingTargetRef.current = host
          return
        }

        hideTooltip()
      }, HIDE_DELAY_MS)
    }

    const onScroll = () => hideTooltip()
    const onMouseDown = () => hideTooltip()

    document.addEventListener('mousemove', onPointerMove, { passive: true })
    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('mousedown', onMouseDown)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(refreshRafRef.current)
      document.removeEventListener('mousemove', onPointerMove)
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('mousedown', onMouseDown)
      hideTooltip()
    }
  }, [])

  if (!tooltip) return null

  const wrap = tooltip.text.length > LONG_TEXT_THRESHOLD

  return createPortal(
    <div
      className={wrap ? `${styles.tooltip} ${styles.tooltipWrap}` : styles.tooltip}
      style={{ left: tooltip.left, top: tooltip.top }}
      role="tooltip"
    >
      {tooltip.text}
    </div>,
    document.body
  )
}
