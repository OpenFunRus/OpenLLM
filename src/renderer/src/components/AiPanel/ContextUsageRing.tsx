import styles from './ContextUsageRing.module.css'

const RING_RADIUS = 6
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface ContextUsageRingProps {
  used: number
  total: number
  title: string
  className?: string
}

export function ContextUsageRing({ used, total, title, className }: ContextUsageRingProps): JSX.Element {
  const ratio = total > 0 ? Math.min(1, used / total) : 0
  const pct = Math.round(ratio * 100)
  const dash = ratio * RING_CIRCUMFERENCE
  const progressClass =
    pct > 75 ? styles.progressDanger : pct >= 50 ? styles.progressWarn : styles.progress

  return (
    <div className={`${styles.wrap}${className ? ` ${className}` : ''}`} title={title} aria-label={title}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle
          className={styles.track}
          cx="8"
          cy="8"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="1.5"
        />
        <circle
          className={progressClass}
          cx="8"
          cy="8"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${RING_CIRCUMFERENCE - dash}`}
          transform="rotate(-90 8 8)"
        />
      </svg>
    </div>
  )
}
