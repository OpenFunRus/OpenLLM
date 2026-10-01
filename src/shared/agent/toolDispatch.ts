import type { ToolResult } from './types'

export type ToolDispatchPayload = {
  content: string
  filePath?: string
  oldContent?: string
  newContent?: string
  directoryPath?: string
}

export type ToolDispatchResult = string | ToolDispatchPayload

export function normalizeToolDispatch(
  name: string,
  raw: ToolDispatchResult,
  toolCallId?: string
): ToolResult {
  if (typeof raw === 'string') {
    return {
      toolCallId,
      name,
      content: raw,
      isError: raw.startsWith('Error:'),
    }
  }

  return {
    toolCallId,
    name,
    content: raw.content,
    isError: raw.content.startsWith('Error:'),
    filePath: raw.filePath,
    oldContent: raw.oldContent,
    newContent: raw.newContent,
    directoryPath: raw.directoryPath,
  }
}
