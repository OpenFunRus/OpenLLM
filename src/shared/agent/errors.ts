export class AgentAbortedError extends Error {
  constructor(message = 'Agent stopped.') {
    super(message)
    this.name = 'AgentAbortedError'
  }
}
