import { MarkdownRenderer } from '../Markdown/MarkdownRenderer'
import styles from './MarkdownPreview.module.css'

interface Props {
  content: string
}

export function MarkdownPreview({ content }: Props): JSX.Element {
  return (
    <div className={styles.preview}>
      <MarkdownRenderer content={content} />
    </div>
  )
}
