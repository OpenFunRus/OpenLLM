import { renderMessageContent } from '../AiPanel/messageContent'
import styles from './MarkdownPreview.module.css'

interface Props {
  content: string
}

export function MarkdownPreview({ content }: Props): JSX.Element {
  return (
    <div className={styles.preview}>
      {renderMessageContent(content, false, () => {}, () => {}, {}, {}, undefined)}
    </div>
  )
}
