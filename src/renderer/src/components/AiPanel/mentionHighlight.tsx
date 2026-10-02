import type { ReactNode } from 'react'
import mentionStyles from './mentionHighlight.module.css'

/** @file or @path/to/file — path reference in composer / user message. */
export const FILE_MENTION_PATTERN = /(@[^\s]+)/g

export function formatFileMention(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
  return `@${normalized}`
}

export function insertTextAtSelection(
  value: string,
  insertion: string,
  selectionStart: number,
  selectionEnd: number
): { next: string; cursor: number } {
  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)
  const next = `${before}${insertion}${after}`
  return { next, cursor: before.length + insertion.length }
}

export function renderTextWithMentions(text: string): ReactNode[] {
  const parts = text.split(FILE_MENTION_PATTERN)
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span key={`m-${index}`} className={mentionStyles.mention}>
          {part}
        </span>
      )
    }
    return <span key={`t-${index}`}>{part}</span>
  })
}
