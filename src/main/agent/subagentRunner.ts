import crypto from 'crypto'
import type { AgentMode, AgentUserContext } from '../../shared/agent/types'
import { agentOrchestrator } from './AgentOrchestrator'
import { getShellService } from './shellRegistry'

export type SubagentType =
  | 'generalPurpose'
  | 'explore'
  | 'shell'
  | 'cursor-guide'
  | 'ci-investigator'
  | 'bugbot'
  | 'security-review'
  | 'best-of-n-runner'

const LOCAL_SUBAGENTS = new Set<SubagentType>(['generalPurpose', 'explore', 'shell'])

const SUBAGENT_ALLOWED_TOOLS: Record<SubagentType, Set<string>> = {
  explore: new Set(['Read', 'Glob', 'Grep', 'ReadLints', 'WebSearch', 'WebFetch', 'GetDynamicTools']),
  generalPurpose: new Set([
    'Read', 'Write', 'StrReplace', 'Delete', 'Glob', 'Grep', 'Shell', 'AwaitShell',
    'ReadLints', 'WebSearch', 'WebFetch', 'GetDynamicTools', 'CallDynamicTool',
  ]),
  shell: new Set(['Shell', 'AwaitShell', 'Read', 'Glob', 'Grep']),
  'cursor-guide': new Set(),
  'ci-investigator': new Set(),
  bugbot: new Set(),
  'security-review': new Set(),
  'best-of-n-runner': new Set(),
}

export type SubagentRunResult = {
  agentId: string
  finalText: string
  steps: number
}

export function isLocalSubagentType(type: string): type is SubagentType {
  return LOCAL_SUBAGENTS.has(type as SubagentType)
}

export async function runLocalSubagent(input: {
  subagentType: SubagentType
  prompt: string
  description: string
  parentSessionId: string
  userContext: AgentUserContext
  resume?: string
  agentId?: string
}): Promise<SubagentRunResult> {
  if (!LOCAL_SUBAGENTS.has(input.subagentType)) {
    throw new Error(`Subagent type "${input.subagentType}" is not available locally in OpenLLM`)
  }

  const agentId =
    input.agentId ??
    (input.resume && input.resume !== 'self' ? input.resume : crypto.randomUUID())
  const sessionId = `subagent__${input.parentSessionId}__${agentId}`
  const mode: AgentMode = input.subagentType === 'explore' ? 'chat' : 'agent'

  const parentShell = getShellService(input.parentSessionId, input.userContext.workspacePath)

  const result = await agentOrchestrator.run(
    {
      query: buildSubagentPrompt(input.subagentType, input.prompt, input.description),
      sessionId,
      mode,
      allowedTools: [...SUBAGENT_ALLOWED_TOOLS[input.subagentType]],
      userContext: {
        ...input.userContext,
        terminalsFolder: parentShell.getTerminalsDirectory(),
      },
    },
    {
      isAborted: () => false,
    }
  )

  return {
    agentId,
    finalText: result.finalText,
    steps: result.steps,
  }
}

function buildSubagentPrompt(type: SubagentType, prompt: string, description: string): string {
  const header = `[Subagent: ${type}] ${description}`
  const guidance =
    type === 'explore'
      ? 'Explore the codebase read-only. Return concise findings with file paths.'
      : type === 'shell'
        ? 'Use Shell for terminal operations. Return command outputs and conclusions.'
        : 'Complete the task autonomously. Return a concise final summary.'

  return `${header}\n\n${guidance}\n\n${prompt}`
}
