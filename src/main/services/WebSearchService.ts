import { tavily, TavilyKeylessLimitError } from '@tavily/core'
import { settingsService } from './SettingsService'

export type WebSearchHit = {
  title: string
  url: string
  snippet: string
}

export type WebSearchResponse = {
  query: string
  answer?: string
  results: WebSearchHit[]
  provider: 'tavily'
  keyless: boolean
}

function getTavilyClient() {
  const apiKey = settingsService.get('tavilyApiKey')?.trim()
  return apiKey ? tavily({ apiKey }) : tavily()
}

export async function runWebSearch(query: string): Promise<WebSearchResponse> {
  const apiKey = settingsService.get('tavilyApiKey')?.trim()
  const client = getTavilyClient()

  try {
    const response = await client.search(query, {
      maxResults: 8,
      searchDepth: apiKey ? 'advanced' : 'basic',
      includeAnswer: apiKey ? 'advanced' : true,
    })

    return {
      query,
      answer: response.answer?.trim() || undefined,
      results: (response.results ?? [])
        .map((item) => ({
          title: item.title?.trim() ?? '',
          url: item.url?.trim() ?? '',
          snippet: item.content?.trim() ?? '',
        }))
        .filter((item) => item.title && item.url),
      provider: 'tavily',
      keyless: !apiKey,
    }
  } catch (err) {
    if (err instanceof TavilyKeylessLimitError) {
      throw new Error(
        'Tavily keyless rate limit reached. Add a free API key in Settings → Agent (1000 searches/month at tavily.com).'
      )
    }
    throw err
  }
}
