import fs from 'fs/promises'
import path from 'path'
import type { ToolDispatchResult } from '../../../shared/agent/toolDispatch'
import { fileService } from '../../services/FileService'
import type { AgentToolContext } from '../AgentToolContext'

export type CreatePlanResult = {
  ok: true
  name?: string
  overview?: string
  plan: string
  todos?: Array<{ id: string; content: string }>
  filePath?: string
}

function slugifyPlanName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'plan'
}

function buildPlanMarkdown(
  plan: string,
  overview?: string,
  todos?: Array<{ id: string; content: string }>
): string {
  const sections: string[] = []
  if (overview?.trim()) {
    sections.push(overview.trim(), '')
  }
  sections.push(plan.trim())
  if (todos?.length) {
    sections.push('', '## Todos', '')
    for (const todo of todos) {
      sections.push(`- [ ] **${todo.id}**: ${todo.content}`)
    }
  }
  return sections.join('\n')
}

/** Plan mode — writes markdown to `.openllm/plans/` and returns payload for UI. */
export async function executeCreatePlan(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<ToolDispatchResult> {
  const plan = String(args.plan ?? '').trim()
  if (!plan) return 'Error: plan is required'

  const todosRaw = args.todos
  const todos = Array.isArray(todosRaw)
    ? todosRaw
        .filter((t): t is { id: string; content: string } =>
          Boolean(t && typeof t === 'object' && typeof (t as { id?: string }).id === 'string')
        )
        .map((t) => ({ id: t.id, content: String((t as { content?: string }).content ?? '') }))
    : undefined

  const name = typeof args.name === 'string' ? args.name : undefined
  const overview = typeof args.overview === 'string' ? args.overview : undefined

  let filePath: string | undefined
  if (ctx.workspaceRoot) {
    const plansDir = path.join(ctx.workspaceRoot, '.openllm', 'plans')
    await fs.mkdir(plansDir, { recursive: true })
    const baseName = name ? slugifyPlanName(name) : `plan-${Date.now()}`
    filePath = path.join(plansDir, `${baseName}.md`)
    const markdown = buildPlanMarkdown(plan, overview, todos)
    await fileService.writeFile(filePath, markdown)
  }

  const result: CreatePlanResult = {
    ok: true,
    name,
    overview,
    plan,
    todos,
    filePath,
  }

  const summary = filePath
    ? `Plan saved to ${filePath}`
    : 'Plan created (no workspace open — file not written)'

  return {
    content: JSON.stringify(result),
    filePath,
    newContent: plan,
  }
}
