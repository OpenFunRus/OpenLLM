import type { AgentToolEvent } from '@shared/agent/types'
import { t } from '@shared/i18n'
import { relativeDisplayPath } from '../../utils/lineDiff'

export const INLINE_TOOL_NAMES = new Set([
  'Glob',
  'Grep',
  'Read',
  'ReadLints',
  'WebSearch',
  'WebFetch',
  'EditNotebook',
  'GetDynamicTools',
  'CallDynamicTool',
  'FetchMcpResource',
])

export function isInlineTool(name: string): boolean {
  return INLINE_TOOL_NAMES.has(name)
}

export interface InlineToolPresentation {
  title: string
  pendingBody: string
  result: string
}

function lintTargetLabel(args: Record<string, unknown>, workspacePath?: string | null): string {
  const paths = args.paths
  if (!Array.isArray(paths) || paths.length === 0) {
    return t.readLintsTargetAll
  }

  const normalized = paths
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => relativeDisplayPath(p, workspacePath))

  if (normalized.length === 0) return t.readLintsTargetAll
  if (normalized.length === 1) return normalized[0]
  return t.readLintsTargetFiles(normalized.length)
}

function lintPathsList(args: Record<string, unknown>, workspacePath?: string | null): string[] {
  const paths = args.paths
  if (!Array.isArray(paths)) return []
  return paths
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => relativeDisplayPath(p, workspacePath))
}

function truncateMiddle(text: string, max = 48): string {
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(-tail)}`
}

function looksLikeToolArgsJson(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function formatGlobResult(result: string, workspacePath?: string | null): string {
  if (result === 'No files found') return t.globNoFiles
  if (result.startsWith('Error:')) return result
  return result
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => relativeDisplayPath(line, workspacePath))
    .join('\n')
}

function formatReadLintsResult(
  event: AgentToolEvent,
  result: string,
  workspacePath?: string | null
): string {
  const lines: string[] = []
  const paths = lintPathsList(event.arguments, workspacePath)
  if (paths.length > 0) {
    lines.push(t.readLintsCheckedFiles, ...paths.map((p) => `  ${p}`), '')
  }

  if (result === 'No linter errors found.') {
    lines.push(t.readLintsNoIssues)
  } else if (result.includes('No TypeScript/JavaScript files found')) {
    lines.push(result)
  } else if (result.startsWith('Error:')) {
    lines.push(result)
  } else if (result.trim()) {
    lines.push(t.readLintsIssuesHeader, result)
  } else {
    lines.push(t.readLintsNoIssues)
  }

  return lines.join('\n').trim()
}

function formatToolResult(
  event: AgentToolEvent,
  workspacePath?: string | null
): string {
  const result = event.result?.trim() ?? ''
  if (!result && event.isError) return t.failed
  if (!result) return ''

  switch (event.name) {
    case 'Glob':
      return formatGlobResult(result, workspacePath)
    case 'ReadLints':
      return formatReadLintsResult(event, result, workspacePath)
    default:
      if (looksLikeToolArgsJson(result)) return ''
      return result
  }
}

function toolResultText(event: AgentToolEvent, workspacePath?: string | null): string {
  if (event.status === 'pending') return ''

  const formatted = formatToolResult(event, workspacePath)
  if (formatted) return formatted

  if (event.name === 'ReadLints') return t.readLintsNoIssues
  return event.isError ? t.failed : ''
}

export function getInlineToolPresentation(
  event: AgentToolEvent,
  workspacePath?: string | null
): InlineToolPresentation {
  const args = event.arguments
  const result = toolResultText(event, workspacePath)

  switch (event.name) {
    case 'Glob': {
      const pattern = typeof args.glob_pattern === 'string' ? args.glob_pattern : '…'
      return {
        title: t.globTitle(pattern),
        pendingBody: t.globChecking(pattern),
        result,
      }
    }
    case 'Grep': {
      const pattern = typeof args.pattern === 'string' ? args.pattern : '…'
      return {
        title: t.grepTitle(pattern),
        pendingBody: t.grepChecking(pattern),
        result,
      }
    }
    case 'Read': {
      const path =
        typeof args.path === 'string'
          ? relativeDisplayPath(args.path, workspacePath)
          : '…'
      return {
        title: t.readTitle(path),
        pendingBody: t.readChecking(path),
        result,
      }
    }
    case 'ReadLints': {
      const target = lintTargetLabel(args, workspacePath)
      return {
        title: t.readLintsTitle(target),
        pendingBody: t.readLintsCheckingBody(target),
        result,
      }
    }
    case 'WebSearch': {
      const query = typeof args.search_term === 'string' ? args.search_term.trim() : '…'
      return {
        title: t.webSearchTitle(query),
        pendingBody: t.webSearchChecking(query),
        result,
      }
    }
    case 'WebFetch': {
      const url = typeof args.url === 'string' ? truncateMiddle(args.url.trim()) : '…'
      return {
        title: t.webFetchTitle(url),
        pendingBody: t.webFetchChecking(url),
        result,
      }
    }
    case 'EditNotebook': {
      const path =
        typeof args.target_notebook === 'string'
          ? relativeDisplayPath(args.target_notebook, workspacePath)
          : '…'
      return {
        title: t.editNotebookTitle(path),
        pendingBody: t.editNotebookChecking(path),
        result,
      }
    }
    case 'GetDynamicTools': {
      const scope =
        typeof args.namespace === 'string'
          ? args.namespace
          : typeof args.pattern === 'string'
            ? args.pattern
            : '…'
      return {
        title: t.getDynamicToolsTitle(scope),
        pendingBody: t.getDynamicToolsChecking(scope),
        result,
      }
    }
    case 'CallDynamicTool': {
      const label =
        typeof args.toolName === 'string'
          ? `${args.namespace ?? 'mcp'}/${args.toolName}`
          : '…'
      return {
        title: t.callDynamicToolTitle(label),
        pendingBody: t.callDynamicToolChecking(label),
        result,
      }
    }
    case 'FetchMcpResource': {
      const uri = typeof args.uri === 'string' ? truncateMiddle(args.uri.trim()) : '…'
      return {
        title: t.fetchMcpResourceTitle(uri),
        pendingBody: t.fetchMcpResourceChecking(uri),
        result,
      }
    }
    default:
      return {
        title: event.name,
        pendingBody: t.inlineToolChecking(event.name),
        result,
      }
  }
}
