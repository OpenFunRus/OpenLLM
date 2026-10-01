import type { AgentTodoItem, AgentTodoStatus } from '../../../shared/agent/types'
import type { AgentToolContext } from '../AgentToolContext'
import { getSessionTodos, setSessionTodos } from '../todoSessionStore'

const VALID_STATUSES: AgentTodoStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']

function parseTodoItem(raw: unknown): AgentTodoItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.id !== 'string' || typeof item.content !== 'string') return null
  const status = item.status
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as AgentTodoStatus)) return null
  return { id: item.id, content: item.content, status: status as AgentTodoStatus }
}

function mergeTodos(existing: AgentTodoItem[], incoming: AgentTodoItem[]): AgentTodoItem[] {
  const map = new Map(existing.map((t) => [t.id, t]))
  for (const todo of incoming) {
    map.set(todo.id, todo)
  }
  return [...map.values()]
}

export function executeTodoWrite(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): string {
  const sessionId = ctx.sessionId ?? 'default'
  const merge = args.merge === true
  const rawTodos = args.todos

  if (!Array.isArray(rawTodos) || rawTodos.length < 2) {
    return 'Error: todos must be an array with at least 2 items'
  }

  const incoming: AgentTodoItem[] = []
  for (const raw of rawTodos) {
    const parsed = parseTodoItem(raw)
    if (!parsed) return 'Error: each todo requires id, content, and valid status'
    incoming.push(parsed)
  }

  const next = merge ? mergeTodos(getSessionTodos(sessionId), incoming) : incoming
  setSessionTodos(sessionId, next)

  return JSON.stringify({ ok: true, todos: next })
}
