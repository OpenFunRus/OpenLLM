import { runWebSearch } from '../../services/WebSearchService'
import { truncateText } from './webUtils'
import { formatWebSearchResult } from './webSearchFormat'

export async function executeWebSearch(
  _ctx: import('../AgentToolContext').AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const searchTerm = String(args.search_term ?? '').trim()
  if (!searchTerm) return 'Error: search_term is required'

  try {
    const data = await runWebSearch(searchTerm)
    return truncateText(formatWebSearchResult(data), 10_000)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
