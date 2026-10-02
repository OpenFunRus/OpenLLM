import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { IconChevronDown, IconChevronRight } from '../Sidebar/ExplorerIcons'
import styles from './ThinkingBlock.module.css'

interface Props {
  title: string
  pendingBody: string
  result: string
  live: boolean
}

function AnimatedDots(): JSX.Element {
  return (
    <span className={styles.dots} aria-hidden>
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  )
}

export function InlineToolLine({ title, pendingBody, result, live }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const wasLive = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const body: ReactNode = live ? (
    <>
      {pendingBody}
      <AnimatedDots />
    </>
  ) : (
    result
  )

  useEffect(() => {
    if (live) {
      setExpanded(true)
    } else if (wasLive.current) {
      setExpanded(false)
    }
    wasLive.current = live
  }, [live])

  useEffect(() => {
    if (!live) return
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [body, live])

  const showBody = live || expanded

  const toggleExpanded = (e: MouseEvent) => {
    e.stopPropagation()
    if (live) return
    setExpanded((v) => !v)
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.header}
        onClick={toggleExpanded}
        aria-expanded={showBody}
      >
        <span className={styles.chevron}>
          {showBody ? <IconChevronDown /> : <IconChevronRight />}
        </span>
        <span className={styles.label}>{title}</span>
      </button>
      {showBody && (
        <div ref={bodyRef} className={`${styles.body} ${styles.bodyMono}`}>
          {body}
        </div>
      )}
    </div>
  )
}
