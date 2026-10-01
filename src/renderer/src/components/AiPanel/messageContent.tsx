import type { ReactNode } from 'react'
import styles from './ChatMessage.module.css'
import { DiffCodeBlock } from './DiffCodeBlock'
import { t } from '../../../../shared/i18n'

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g).filter((p) => p.length > 0)
  return parts.map((part, j) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={`${keyPrefix}-${j}`}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={`${keyPrefix}-${j}`}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={`${keyPrefix}-${j}`} className={styles.inlineCode}>{part.slice(1, -1)}</code>
    return <span key={`${keyPrefix}-${j}`}>{part}</span>
  })
}

function isSpecialLine(line: string): boolean {
  return (
    /^DELETE:.+/.test(line) ||
    /^RUN:.+/.test(line) ||
    /^#{1,3}\s/.test(line) ||
    /^[-*]\s/.test(line) ||
    /^\d+\.\s/.test(line)
  )
}

function renderParagraph(text: string, key: string): ReactNode {
  const trimmed = text.trim()
  const boldOnly = trimmed.match(/^\*\*(.+)\*\*$/)
  if (boldOnly) {
    return (
      <p key={key} className={styles.mdHeading}>
        {boldOnly[1]}
      </p>
    )
  }
  return (
    <p key={key} className={styles.mdParagraph}>
      {renderInline(trimmed, key)}
    </p>
  )
}

function renderMarkdownText(
  text: string,
  segKey: number,
  onDeleteFile: (filePath: string) => void,
  onRunCommand: (cmd: string) => void,
  deleteStatus: Record<string, 'pending' | 'ok' | 'err'>,
  runStatus: Record<string, 'ran' | 'err'>
): ReactNode {
  const lines = text.split('\n')
  const nodes: ReactNode[] = []
  let i = 0
  let blockIdx = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    const deleteMatch = line.match(/^DELETE:(.+)$/)
    if (deleteMatch) {
      const fp = deleteMatch[1].trim()
      const status = deleteStatus[fp]
      nodes.push(
        <div key={`${segKey}-del-${blockIdx++}`} className={styles.deleteDirective}>
          <span className={styles.deleteIcon}>🗑</span>
          <span className={styles.deletePath}>{fp}</span>
          {status === 'ok' ? (
            <span className={styles.deleteOk}>{t.deleted}</span>
          ) : status === 'err' ? (
            <span className={styles.deleteErr}>{t.failed}</span>
          ) : (
            <button className={styles.deleteBtn} onClick={() => onDeleteFile(fp)}>
              {t.deleteFile}
            </button>
          )}
        </div>
      )
      i++
      continue
    }

    const runMatch = line.match(/^RUN:(.+)$/)
    if (runMatch) {
      const cmd = runMatch[1].trim()
      const status = runStatus[cmd]
      nodes.push(
        <div key={`${segKey}-run-${blockIdx++}`} className={styles.runDirective}>
          <span className={styles.runIcon}>▶</span>
          <code className={styles.runCmd}>{cmd}</code>
          {status === 'ran' ? (
            <span className={styles.runOk}>{t.running}</span>
          ) : (
            <button className={styles.runBtn} onClick={() => onRunCommand(cmd)}>
              {t.run}
            </button>
          )}
        </div>
      )
      i++
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      nodes.push(
        <p key={`${segKey}-h-${blockIdx++}`} className={level <= 2 ? styles.mdHeading : styles.mdSubheading}>
          {renderInline(headingMatch[2], `${segKey}-h-${blockIdx}`)}
        </p>
      )
      i++
      continue
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''))
        i++
      }
      nodes.push(
        <ul key={`${segKey}-ul-${blockIdx++}`} className={styles.mdList}>
          {items.map((item, li) => (
            <li key={li}>{renderInline(item, `${segKey}-ul-${blockIdx}-${li}`)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      nodes.push(
        <ol key={`${segKey}-ol-${blockIdx++}`} className={styles.mdList}>
          {items.map((item, li) => (
            <li key={li}>{renderInline(item, `${segKey}-ol-${blockIdx}-${li}`)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
      paraLines.push(lines[i])
      i++
    }
    nodes.push(renderParagraph(paraLines.join('\n'), `${segKey}-p-${blockIdx++}`))
  }

  return <div className={styles.mdContent}>{nodes}</div>
}

function renderUserText(text: string): ReactNode {
  const hasList = /^[-*]\s/m.test(text)
  if (!hasList) return text

  const lines = text.split('\n')
  const nodes: ReactNode[] = []
  let i = 0
  let blockIdx = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''))
        i++
      }
      nodes.push(
        <ul key={`user-ul-${blockIdx++}`} className={styles.userList}>
          {items.map((item, li) => (
            <li key={li}>{renderInline(item, `user-${blockIdx}-${li}`)}</li>
          ))}
        </ul>
      )
      continue
    }

    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() && !/^[-*]\s/.test(lines[i])) {
      paraLines.push(lines[i])
      i++
    }
    nodes.push(
      <p key={`user-p-${blockIdx++}`} className={styles.userParagraph}>
        {renderInline(paraLines.join('\n'), `user-p-${blockIdx}`)}
      </p>
    )
  }

  return nodes.length > 0 ? nodes : text
}

export function renderMessageContent(
  text: string,
  isUser: boolean,
  onDeleteFile: (filePath: string) => void,
  onRunCommand: (cmd: string) => void,
  deleteStatus: Record<string, 'pending' | 'ok' | 'err'>,
  runStatus: Record<string, 'ran' | 'err'>,
  workspacePath: string | undefined
): ReactNode {
  if (isUser) {
    return renderUserText(text)
  }

  const segments = text.split(/(```[\s\S]*?```)/g)

  return segments.map((seg, i) => {
    if (!seg.startsWith('```')) {
      if (!seg.trim()) return null
      return renderMarkdownText(seg, i, onDeleteFile, onRunCommand, deleteStatus, runStatus)
    }

    const lines = seg.split('\n')
    const header = lines[0].replace('```', '').trim()
    const colonIdx = header.indexOf(':')
    const lang = colonIdx > 0 ? header.slice(0, colonIdx) : header
    let filePath = colonIdx > 0 ? header.slice(colonIdx + 1).trim() : null
    const code = lines.slice(1, -1).join('\n')

    if (!filePath && i > 0) {
      const prev = segments[i - 1]
      const m = prev.match(/`([^`\n]+\.[a-zA-Z0-9]{1,10})`\s*$/)
      if (m) filePath = m[1].trim()
    }

    if (filePath) {
      return (
        <DiffCodeBlock
          key={i}
          filePath={filePath}
          lang={lang}
          newCode={code}
          workspacePath={workspacePath}
        />
      )
    }

    return (
      <div key={i} className={styles.codeBlock}>
        {lang && (
          <div className={styles.codeHeader}>
            <span className={styles.codeLang}>{lang}</span>
          </div>
        )}
        <pre className={styles.code}><code>{code}</code></pre>
      </div>
    )
  })
}
