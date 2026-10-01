import { assertPublicHttpUrl, fetchText, htmlToReadableText, truncateText } from './webUtils'

type SearchResult = {
  title: string
  url: string
  snippet: string
}

export async function executeWebSearch(
  _ctx: import('../AgentToolContext').AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const searchTerm = String(args.search_term ?? '').trim()
  if (!searchTerm) return 'Error: search_term is required'

  try {
    const ddg = await fetchDuckDuckGoInstant(searchTerm)
    const htmlResults = ddg.results.length === 0 ? await fetchDuckDuckGoHtml(searchTerm) : []

    const results = ddg.results.length > 0 ? ddg.results : htmlResults
    const lines: string[] = [`Search: ${searchTerm}`, '']

    if (ddg.abstract) {
      lines.push('## Summary', ddg.abstract, '')
      if (ddg.abstractUrl) lines.push(`Source: ${ddg.abstractUrl}`, '')
    }

    if (results.length === 0) {
      lines.push('No web results found.')
      return lines.join('\n')
    }

    lines.push('## Results')
    for (const [idx, result] of results.slice(0, 8).entries()) {
      lines.push(`${idx + 1}. **${result.title}**`, `   ${result.url}`)
      if (result.snippet) lines.push(`   ${result.snippet}`)
      lines.push('')
    }

    return truncateText(lines.join('\n').trim(), 10_000)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function fetchDuckDuckGoInstant(searchTerm: string): Promise<{
  abstract: string
  abstractUrl: string
  results: SearchResult[]
}> {
  const url = new URL('https://api.duckduckgo.com/')
  url.searchParams.set('q', searchTerm)
  url.searchParams.set('format', 'json')
  url.searchParams.set('no_html', '1')
  url.searchParams.set('skip_disambig', '1')

  const { text } = await fetchText(url)
  const data = JSON.parse(text) as {
    Abstract?: string
    AbstractURL?: string
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>
    Results?: Array<{ Text?: string; FirstURL?: string }>
  }

  const results: SearchResult[] = []

  for (const item of data.Results ?? []) {
    if (item.FirstURL && item.Text) {
      results.push(parseDdgTopic(item.Text, item.FirstURL))
    }
  }

  for (const group of data.RelatedTopics ?? []) {
    if (group.Topics) {
      for (const topic of group.Topics) {
        if (topic.FirstURL && topic.Text) {
          results.push(parseDdgTopic(topic.Text, topic.FirstURL))
        }
      }
    } else if (group.FirstURL && group.Text) {
      results.push(parseDdgTopic(group.Text, group.FirstURL))
    }
  }

  return {
    abstract: data.Abstract?.trim() ?? '',
    abstractUrl: data.AbstractURL?.trim() ?? '',
    results,
  }
}

function parseDdgTopic(text: string, url: string): SearchResult {
  const dashIdx = text.indexOf(' - ')
  if (dashIdx >= 0) {
    return {
      title: text.slice(0, dashIdx).trim(),
      snippet: text.slice(dashIdx + 3).trim(),
      url,
    }
  }
  return { title: text.trim(), snippet: '', url }
}

async function fetchDuckDuckGoHtml(searchTerm: string): Promise<SearchResult[]> {
  const url = assertPublicHttpUrl('https://html.duckduckgo.com/html/')
  const { text: html } = await fetchText(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(searchTerm)}`,
  })

  const results: SearchResult[] = []
  const resultRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi

  let match: RegExpExecArray | null
  while ((match = resultRe.exec(html)) !== null && results.length < 8) {
    const href = decodeDuckDuckGoRedirect(match[1] ?? '')
    const title = stripTags(match[2] ?? '').trim()
    const snippet = stripTags(match[3] ?? '').trim()
    if (href && title) {
      results.push({ title, url: href, snippet })
    }
  }

  return results
}

function stripTags(value: string): string {
  return htmlToReadableText(value.replace(/<[^>]+>/g, ' '))
}

function decodeDuckDuckGoRedirect(href: string): string {
  try {
    const absolute = href.startsWith('http') ? href : `https://duckduckgo.com${href}`
    const parsed = new URL(absolute)
    const uddg = parsed.searchParams.get('uddg')
    return uddg ? decodeURIComponent(uddg) : absolute
  } catch {
    return href
  }
}
