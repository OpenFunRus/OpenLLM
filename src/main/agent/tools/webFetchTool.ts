import type { AgentToolContext } from '../AgentToolContext'
import { assertPublicHttpUrl, fetchText, htmlToReadableText, truncateText } from './webUtils'

export async function executeWebFetch(
  _ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const rawUrl = String(args.url ?? '')
  if (!rawUrl.trim()) return 'Error: url is required'

  try {
    const url = assertPublicHttpUrl(rawUrl)
    const { text, contentType } = await fetchText(url)

    let body: string
    if (/html/i.test(contentType)) {
      body = htmlToReadableText(text)
    } else if (/json/i.test(contentType)) {
      try {
        body = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        body = text
      }
    } else {
      body = text
    }

    if (!body.trim()) {
      return 'Page fetched successfully but contained no readable text.'
    }

    return truncateText(`# ${url.toString()}\n\n${body}`)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
