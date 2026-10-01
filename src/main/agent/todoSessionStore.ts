import type { AgentTodoItem } from '../../shared/agent/types'

const sessionTodos = new Map<string, AgentTodoItem[]>()

export function getSessionTodos(sessionId: string): AgentTodoItem[] {
  return sessionTodos.get(sessionId) ?? []
}

export function setSessionTodos(sessionId: string, todos: AgentTodoItem[]): AgentTodoItem[] {
  sessionTodos.set(sessionId, todos)
  return todos
}

export function clearSessionTodos(sessionId: string): void {
  sessionTodos.delete(sessionId)
}
