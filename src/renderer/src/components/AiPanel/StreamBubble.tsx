import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { tailText } from '@shared/agent/tailPreview'
import { IconChevronDown, IconChevronRight } from '../Sidebar/ExplorerIcons'
import styles from './StreamBubble.module.css'

export type StreamBubbleStatus = 'streaming' | 'running' | 'done' | 'error'

interface Props {
  title: ReactNode
  body?: string
  bodyNode?: ReactNode | ((showFull: boolean) => ReactNode)
  live?: boolean
  status?: StreamBubbleStatus
  defaultExpanded?: boolean
  previewLines?: number
  /** Always show N-line preview when done (never collapse body). */
  pinPreview?: boolean
  /** Header only — used during stream to collapse non-focused operations. */
  forceHeaderOnly?: boolean
  onTitleClick?: () => void
  headerExtra?: ReactNode
  className?: string
  bodyClassName?: string
}

export function StreamBubble({
  title,
  body = '',
  bodyNode,
  live = false,
  status = 'done',
  defaultExpanded = false,
  previewLines = 4,
  pinPreview = false,
  forceHeaderOnly = false,
  onTitleClick,
  headerExtra,
  className,
  bodyClassName,
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  /** User manually toggled chevron — don't auto-collapse/expand over their choice. */
  const userToggled = useRef(false)
  const wasActive = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const isActive = !forceHeaderOnly && (live || status === 'streaming' || status === 'running')
  const showBody = !forceHeaderOnly && (pinPreview || expanded || isActive)
  const showFullBody = expanded && (!isActive || pinPreview)
  const showFullForNode = showFullBody || isActive
  const displayBody = showFullBody ? body : tailText(body, previewLines)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (isActive) {
      el.scrollTop = el.scrollHeight
    } else if (showFullBody) {
      el.scrollTop = 0
    }
  }, [body, isActive, showFullBody, showFullForNode])

  const toggleExpanded = (e: MouseEvent) => {
    e.stopPropagation()
    userToggled.current = true
    setExpanded((v) => !v)
  }

  const handleTitleClick = (e: MouseEvent) => {
    if (!onTitleClick) return
    e.stopPropagation()
    onTitleClick()
  }

  useEffect(() => {
    if (isActive) {
      if (!userToggled.current) setExpanded(true)
    } else if (wasActive.current && !userToggled.current) {
      setExpanded(pinPreview ? false : defaultExpanded)
    }
    wasActive.current = isActive
  }, [isActive, defaultExpanded, pinPreview])

  const chevronExpanded = pinPreview ? expanded : (expanded || isActive)
  const renderedBodyNode =
    typeof bodyNode === 'function' ? bodyNode(showFullForNode) : bodyNode

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`}>
      <div className={`${styles.header} ${isActive ? styles.headerActive : ''}`}>
        <button
          type="button"
          className={styles.chevron}
          onClick={toggleExpanded}
          aria-label={chevronExpanded ? 'Collapse' : 'Expand'}
        >
          {showBody && chevronExpanded ? <IconChevronDown /> : <IconChevronRight />}
        </button>
        {onTitleClick ? (
          <button
            type="button"
            className={`${styles.title} ${styles.titleClickable} ${isActive ? styles.pulse : ''}`}
            onClick={handleTitleClick}
          >
            {title}
          </button>
        ) : (
          <div className={`${styles.title} ${isActive ? styles.pulse : ''}`}>{title}</div>
        )}
        {headerExtra}
        {isActive && <span className={styles.activeDot} />}
      </div>
      {showBody && (renderedBodyNode || displayBody || isActive || pinPreview) && (
        <div
          ref={bodyRef}
          className={`${renderedBodyNode ? styles.bodyCustom : styles.body} ${showFullForNode && renderedBodyNode ? styles.bodyCustomExpanded : ''} ${isActive && !renderedBodyNode ? styles.bodyLive : ''} ${bodyClassName ?? ''}`}
        >
          {renderedBodyNode ?? (
            <>
              {displayBody}
              {isActive && <span className={styles.cursor}>▋</span>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
