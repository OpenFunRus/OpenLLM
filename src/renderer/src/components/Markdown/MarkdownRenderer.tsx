import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './MarkdownRenderer.module.css'

interface Props {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: Props): JSX.Element {
  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => {
                if (!href) return
                e.preventDefault()
                window.open(href, '_blank', 'noopener,noreferrer')
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
