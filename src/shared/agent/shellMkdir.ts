import path from 'path'

/** Best-effort mkdir path extraction for agent UI bubbles. */
export function detectMkdirPath(
  command: string,
  workspaceRoot?: string | null,
  workingDirectory?: string
): string | null {
  const trimmed = command.trim()
  if (!trimmed) return null

  const base = workingDirectory
    ? path.isAbsolute(workingDirectory)
      ? workingDirectory
      : workspaceRoot
        ? path.join(workspaceRoot, workingDirectory)
        : workingDirectory
    : workspaceRoot ?? null

  const resolveTarget = (target: string): string | null => {
    const cleaned = target.replace(/^["']|["']$/g, '').trim()
    if (!cleaned) return null
    if (path.isAbsolute(cleaned)) return path.normalize(cleaned)
    if (!base) return path.normalize(cleaned)
    return path.normalize(path.join(base, cleaned))
  }

  const mkdirMatch = trimmed.match(
    /^(?:mkdir|md)\s+(?:\/[a-zA-Z]+\s+|[-/][^\s]+\s+)*["']?([^"'&|;]+?)["']?(?:\s|$)/i
  )
  if (mkdirMatch) return resolveTarget(mkdirMatch[1])

  const newItemMatch = trimmed.match(
    /New-Item(?:\s+-(?:Force|Path)\s+["']?[^"'\s]+["']?)*\s+-ItemType\s+Directory(?:\s+-(?:Force|Path)\s+["']?([^"'\s]+)["']?|\s+["']?([^"'\s]+)["']?)/i
  )
  if (newItemMatch) return resolveTarget(newItemMatch[1] ?? newItemMatch[2] ?? '')

  const pathOnlyMatch = trimmed.match(
    /New-Item\s+["']?([^"'\s]+)["']?\s+-ItemType\s+Directory/i
  )
  if (pathOnlyMatch) return resolveTarget(pathOnlyMatch[1])

  return null
}
