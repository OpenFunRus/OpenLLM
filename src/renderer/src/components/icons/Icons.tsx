interface IconProps {
  size?: number
  className?: string
}

export function IconMinimize({ size = 10, className }: IconProps): JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1" y="8.5" width="8" height="1" fill="currentColor" />
    </svg>
  )
}

export function IconMaximize({ size = 10, className }: IconProps): JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

export function IconClose({ size = 10, className }: IconProps): JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export function IconCopy({ size = 14, className }: IconProps): JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M3 5.5h8a1 1 0 0 1 1 1v8.5H4a1 1 0 0 1-1-1V5.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconCheck({ size = 14, className }: IconProps): JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconUndo({ size = 14, className }: IconProps): JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5H11a3.5 3.5 0 1 0 0-7H9.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 6.5L3.5 8.5L5.5 10.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconEdit({ size = 14, className }: IconProps): JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.5 3.5l2 2L6 12H4v-2l6.5-6.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconTrash({ size = 15, className }: IconProps): JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 4.5h10M6 4.5V3.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6.5 7v4M9.5 7v4M4.5 4.5l.5 8a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
