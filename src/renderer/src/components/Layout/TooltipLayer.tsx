import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './TooltipLayer.module.css'

const SHOW_DELAY_MS = 450
const LONG_TEXT_THRESHOLD = 48

interface TooltipState {
  text: string
  left: number
  top: number
}

function findTitledElement(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const el = node.closest('[title], [data-tooltip-held]')
  return el instanceof HTMLElement ? el : null
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

export function TooltipLayer(): JSX.Element | null {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const activeTargetRef = useRef<HTMLElement | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hideTooltip = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }

    const active = activeTargetRef.current
    if (active?.dataset.tooltipHeld) {
      active.setAttribute('title', active.dataset.tooltipHeld)
      delete active.dataset.tooltipHeld
    }

    activeTargetRef.current = null
    setTooltip(null)
  }

  const showTooltip = (el: HTMLElement) => {
    const text = el.getAttribute('title')?.trim()
    if (!text) return

    el.dataset.tooltipHeld = text
    el.removeAttribute('title')
    activeTargetRef.current = el

    const anchor = el.getBoundingClientRect()
    const wrap = text.length > LONG_TEXT_THRESHOLD
    const { width, height } = measureTooltip(text, wrap)
    const { left, top } = computePosition(anchor, width, height)

    setTooltip({ text, left, top })
  }

  useEffect(() => {
    const scheduleShow = (el: HTMLElement) => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      showTimerRef.current = setTimeout(() => showTooltip(el), SHOW_DELAY_MS)
    }

    const onMouseOver = (event: MouseEvent) => {
      const el = findTitledElement(event.target)
      if (!el) {
        if (showTimerRef.current) {
          clearTimeout(showTimerRef.current)
          showTimerRef.current = null
        }
        return
      }
      if (el === activeTargetRef.current) return
      if (!el.getAttribute('title')?.trim()) return

      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      hideTooltip()
      scheduleShow(el)
    }

    const onMouseOut = (event: MouseEvent) => {
      const active = activeTargetRef.current
      if (!active) {
        if (showTimerRef.current) {
          clearTimeout(showTimerRef.current)
          showTimerRef.current = null
        }
        return
      }

      const related = event.relatedTarget
      if (related instanceof Node && active.contains(related)) return
      hideTooltip()
    }

    const onScroll = () => hideTooltip()
    const onMouseDown = () => hideTooltip()

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('mousedown', onMouseDown)

    return () => {
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
