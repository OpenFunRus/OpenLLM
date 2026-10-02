import type { WebSearchResponse } from '../../services/WebSearchService'

/** Tavily answer often says "sources do not provide…" while results are fine — hide that. */
export function isWeakSearchSummary(answer: string, resultCount: number): boolean {
  if (!answer.trim()) return true
  if (resultCount === 0) return false

  const lower = answer.toLowerCase()
  const weakPhrases = [
    'do not provide',
    'does not provide',
    'did not provide',
    'no information',
    'not available in the',
    'cannot find',
    "couldn't find",
    'could not find',
    'unable to find',
    'sources do not',
    'the sources do not',
    'information available pertains to different',
  ]
  return weakPhrases.some((phrase) => lower.includes(phrase))
}

export function formatWebSearchResult(data: WebSearchResponse): string {
  const lines: string[] = []

  if (data.results.length === 0) {
    if (data.answer && !isWeakSearchSummary(data.answer, 0)) {
      lines.push('## Summary', data.answer, '')
    }
    lines.push('No web results found.')
    return lines.join('\n').trim()
  }

  lines.push('## Results')
  for (const [idx, result] of data.results.entries()) {
    lines.push(`${idx + 1}. ${result.title}`, `   ${result.url}`)
    if (result.snippet) lines.push(`   ${result.snippet}`)
    lines.push('')
  }

  if (data.answer && !isWeakSearchSummary(data.answer, data.results.length)) {
    lines.push('## Summary', data.answer)
  }

  return lines.join('\n').trim()
}
