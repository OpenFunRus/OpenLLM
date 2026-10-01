import type {
  AskQuestionAnswers,
  AskQuestionItem,
  AskQuestionOption,
  AskQuestionPayload,
} from '../../../shared/agent/types'
import type { AgentToolContext } from '../AgentToolContext'
import { requestAskQuestion } from '../askQuestionBridge'

function parseQuestions(raw: unknown): AskQuestionItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null

  const questions: AskQuestionItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const q = item as Record<string, unknown>
    if (typeof q.id !== 'string' || typeof q.prompt !== 'string') return null
    if (!Array.isArray(q.options) || q.options.length < 2) return null

    const options: AskQuestionOption[] = []
    for (const opt of q.options) {
      if (!opt || typeof opt !== 'object') return null
      const o = opt as Record<string, unknown>
      if (typeof o.id !== 'string' || typeof o.label !== 'string') return null
      options.push({ id: o.id, label: o.label })
    }

    questions.push({
      id: q.id,
      prompt: q.prompt,
      options,
      allow_multiple: q.allow_multiple === true,
    })
  }

  return questions
}

export function parseAskQuestionPayload(args: Record<string, unknown>): AskQuestionPayload | null {
  const questions = parseQuestions(args.questions)
  if (!questions) return null
  return {
    title: typeof args.title === 'string' ? args.title : undefined,
    questions,
  }
}

/** Blocks until the user submits answers in the renderer modal. */
export async function executeAskQuestion(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const payload = parseAskQuestionPayload(args)
  if (!payload) {
    return 'Error: Invalid AskQuestion payload — need at least one question with 2+ options each'
  }

  try {
    const answers: AskQuestionAnswers = await requestAskQuestion(ctx.runId, payload)
    return JSON.stringify(answers)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return `Error: ${message}`
  }
}
