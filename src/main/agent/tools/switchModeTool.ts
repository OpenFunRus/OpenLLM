import type { AgentMode } from '../../../shared/agent/types'
import type { AgentToolContext } from '../AgentToolContext'
import { requestSwitchMode } from '../askQuestionBridge'

const ALLOWED_TARGETS: AgentMode[] = ['agent', 'plan']

export async function executeSwitchMode(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const targetRaw = args.target_mode_id
  if (typeof targetRaw !== 'string' || !ALLOWED_TARGETS.includes(targetRaw as AgentMode)) {
    return `Error: target_mode_id must be one of: ${ALLOWED_TARGETS.join(', ')}`
  }

  const targetModeId = targetRaw as AgentMode
  const explanation = typeof args.explanation === 'string' ? args.explanation : undefined

  try {
    const result = await requestSwitchMode(ctx.runId, { targetModeId, explanation })
    if (!result.approved) {
      return `Mode switch to "${targetModeId}" was declined by the user.`
    }
    ctx.onModeSwitch?.(result.targetModeId)
    return JSON.stringify({ ok: true, targetModeId: result.targetModeId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return `Error: ${message}`
  }
}
