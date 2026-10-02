/** Last N lines of multiline text (for 4-line bubble previews). */
export function tailLines(text: string, count = 4): string[] {
  if (!text) return []
  const lines = text.split('\n')
  if (lines.length <= count) return lines
  return lines.slice(-count)
}

export function tailText(text: string, count = 4): string {
  return tailLines(text, count).join('\n')
}

/** Best-effort parse of incomplete tool-call JSON arguments while streaming. */
export function tryParsePartialToolArgs(partial: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!partial.trim()) return out

  try {
    const parsed = JSON.parse(partial) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* fall through — partial JSON */
  }

  for (const key of ['path', 'command', 'pattern', 'glob_pattern', 'description', 'url', 'query']) {
    const v = extractPartialJsonString(partial, key)
    if (v !== undefined) out[key] = v
  }

  for (const key of ['contents', 'new_string', 'old_string']) {
    const v = extractPartialJsonString(partial, key, true)
    if (v !== undefined) out[key] = v
  }

  return out
}

function extractPartialJsonString(partial: string, key: string, allowUnclosed = false): string | undefined {
  const marker = `"${key}"`
  const idx = partial.indexOf(marker)
  if (idx === -1) return undefined

  let i = idx + marker.length
  while (i < partial.length && /\s/.test(partial[i]!)) i++
  if (partial[i] !== ':') return undefined
  i++
  while (i < partial.length && /\s/.test(partial[i]!)) i++
  if (partial[i] !== '"') return undefined
  i++

  let result = ''
  while (i < partial.length) {
    const ch = partial[i]!
    if (ch === '\\') {
      const next = partial[i + 1]
      if (next === undefined) break
      if (next === 'n') result += '\n'
      else if (next === 't') result += '\t'
      else if (next === '"') result += '"'
      else if (next === '\\') result += '\\'
      else result += next
      i += 2
      continue
    }
    if (ch === '"') return result
    result += ch
    i++
  }

  return allowUnclosed && result ? result : undefined
}

export function inferToolStreamBody(name: string, args: Record<string, unknown>, partialRaw?: string): string {
  if (name === 'Shell' || name === 'AwaitShell') {
    const cmd = typeof args.command === 'string' ? args.command : ''
    return cmd ? `$ ${cmd}` : ''
  }
  if (name === 'Write' && typeof args.contents === 'string') return args.contents
  if (name === 'StrReplace' && typeof args.new_string === 'string') return args.new_string
  if (name === 'Grep' && typeof args.pattern === 'string') {
    const path = typeof args.path === 'string' ? args.path : '.'
    return `pattern: ${args.pattern}\npath: ${path}`
  }
  if (name === 'Read' && typeof args.path === 'string') return `Reading ${args.path}…`
  if (name === 'Glob') {
    if (typeof args.glob_pattern === 'string') return `glob: ${args.glob_pattern}`
    return ''
  }
  if (name === 'ReadLints' || name === 'Grep' || name === 'Read' || name === 'WebSearch' || name === 'WebFetch') {
    return ''
  }
  if (name === 'Task' && typeof args.description === 'string') return args.description
  if (partialRaw?.trim() && (name === 'Shell' || name === 'AwaitShell')) {
    return partialRaw.slice(0, 200)
  }
  return ''
}
