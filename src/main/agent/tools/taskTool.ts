import crypto from 'crypto'
import type { AgentToolContext } from '../AgentToolContext'
import { notifyBackgroundTaskDone } from '../askQuestionBridge'
import {
  completeBackgroundTask,
  failBackgroundTask,
  startBackgroundTask,
} from '../taskBackgroundStore'
import { isLocalSubagentType, runLocalSubagent, type SubagentType } from '../subagentRunner'
import { workspaceService } from '../../services/WorkspaceService'

const UNSUPPORTED_LOCAL: SubagentType[] = [
  'cursor-guide',
  'ci-investigator',
  'bugbot',
  'security-review',
  'best-of-n-runner',
]

export async function executeTask(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const prompt = String(args.prompt ?? '').trim()
  const description = String(args.description ?? '').trim()
  if (!prompt) return 'Error: prompt is required'
  if (!description) return 'Error: description is required'

  const subagentTypeRaw = typeof args.subagent_type === 'string' ? args.subagent_type : 'generalPurpose'
  const environment = typeof args.environment === 'string' ? args.environment : 'local'
  const runInBackground = args.run_in_background === true

  if (environment === 'cloud') {
    return 'Error: Cloud subagents are not available in OpenLLM'
  }

  if (UNSUPPORTED_LOCAL.includes(subagentTypeRaw as SubagentType)) {
    return `Error: Subagent type "${subagentTypeRaw}" is not available locally in OpenLLM`
  }

  if (!isLocalSubagentType(subagentTypeRaw)) {
    return `Error: Unknown subagent_type "${subagentTypeRaw}"`
  }

  const sessionId = ctx.sessionId ?? 'default'
  const workspacePath = ctx.workspaceRoot ?? workspaceService.current?.path ?? null
  const subagentType = subagentTypeRaw

  const agentId = crypto.randomUUID()

  if (runInBackground) {
    if (!ctx.runId) {
      return 'Error: background Task requires an active agent run'
    }

    startBackgroundTask({ agentId, subagentType, description })

    void runLocalSubagent({
      subagentType,
      prompt,
      description,
      parentSessionId: sessionId,
      agentId,
      userContext: {
        workspacePath,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
      },
    })
      .then((result) => {
        completeBackgroundTask(agentId, result)
        notifyBackgroundTaskDone(ctx.runId, {
          agentId,
          subagentType,
          description,
          status: 'done',
          response: result.finalText,
          steps: result.steps,
        })
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        failBackgroundTask(agentId, message)
        notifyBackgroundTaskDone(ctx.runId, {
          agentId,
          subagentType,
          description,
          status: 'error',
          error: message,
        })
      })

    return JSON.stringify({
      agentId,
      subagent_type: subagentType,
      status: 'running',
      message: `Background subagent started (${subagentType}). You will be notified when it completes.`,
    })
  }

  try {
    const result = await runLocalSubagent({
      subagentType,
      prompt,
      description,
      parentSessionId: sessionId,
      agentId,
      resume: typeof args.resume === 'string' ? args.resume : undefined,
      userContext: {
        workspacePath,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
      },
    })

    return JSON.stringify({
      agentId: result.agentId,
      subagent_type: subagentType,
      steps: result.steps,
      response: result.finalText,
    })
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
