import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { tailText } from '@shared/agent/tailPreview'
import { IconChevronDown, IconChevronRight } from '../Sidebar/ExplorerIcons'
import styles from './StreamBubble.module.css'

export type StreamBubbleStatus = 'streaming' | 'running' | 'done' | 'error'

interface Props {
  title: ReactNode
  body?: string
  bodyNode?: ReactNode | ((expanded: boolean) => ReactNode)
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
  const [userExpanded, setUserExpanded] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const isActive = !forceHeaderOnly && (live || status === 'streaming' || status === 'running')
  const showBody = !forceHeaderOnly && (pinPreview || expanded || isActive)
  const showFullBody = expanded && (!isActive || pinPreview)
  const displayBody = showFullBody ? body : tailText(body, previewLines)

  useEffect(() => {
    if (!isActive) return
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [body, isActive])

  const toggleExpanded = (e: MouseEvent) => {
    e.stopPropagation()
    setExpanded((v) => {
      const next = !v
      if (next) setUserExpanded(true)
      return next
    })
  }

  const handleTitleClick = (e: MouseEvent) => {
    if (!onTitleClick) return
    e.stopPropagation()
    onTitleClick()
  }

  useEffect(() => {
    if (isActive) {
      setExpanded(true)
    } else if (!userExpanded && !pinPreview) {
      setExpanded(defaultExpanded)
    }
  }, [isActive, defaultExpanded, userExpanded, pinPreview])

  const chevronExpanded = pinPreview ? expanded : (expanded || isActive)
  const renderedBodyNode =
    typeof bodyNode === 'function' ? bodyNode(expanded) : bodyNode

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
          className={`${renderedBodyNode ? styles.bodyCustom : styles.body} ${isActive && !renderedBodyNode ? styles.bodyLive : ''} ${bodyClassName ?? ''}`}
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
