import { runWebSearch } from '../../services/WebSearchService'
import { truncateText } from './webUtils'

export async function executeWebSearch(
  _ctx: import('../AgentToolContext').AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const searchTerm = String(args.search_term ?? '').trim()
  if (!searchTerm) return 'Error: search_term is required'

  try {
    const data = await runWebSearch(searchTerm)
    const lines: string[] = [`Search: ${data.query}`, '']

    if (data.answer) {
      lines.push('## Summary', data.answer, '')
    }

    if (data.results.length === 0) {
      lines.push('No web results found.')
      return lines.join('\n')
    }

    lines.push('## Results')
    for (const [idx, result] of data.results.entries()) {
      lines.push(`${idx + 1}. **${result.title}**`, `   ${result.url}`)
      if (result.snippet) lines.push(`   ${result.snippet}`)
      lines.push('')
    }

    return truncateText(lines.join('\n').trim(), 10_000)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
