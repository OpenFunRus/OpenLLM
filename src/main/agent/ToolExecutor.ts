import type { AgentMode, ParsedToolCall, ToolResult } from '../../shared/agent/types'
import { checkModeToolPolicy } from '../../shared/agent/modeToolPolicy'
import { normalizeToolDispatch, type ToolDispatchResult } from '../../shared/agent/toolDispatch'
import { getToolSchema } from '../../shared/agent/tools'
import type { AgentToolContext } from './AgentToolContext'
import { executeRead } from './tools/readTool'
import { executeWrite } from './tools/writeTool'
import { executeDelete } from './tools/deleteTool'
import { executeStrReplace } from './tools/strReplaceTool'
import { executeGlob } from './tools/globTool'
import { executeGrep } from './tools/grepTool'
import { executeShell } from './tools/shellTool'
import { executeCreatePlan } from './tools/createPlanTool'
import { executeAskQuestion } from './tools/askQuestionTool'
import { executeTodoWrite } from './tools/todoWriteTool'
import { executeReadLints } from './tools/readLintsTool'
import { executeSwitchMode } from './tools/switchModeTool'
import { executeWebFetch } from './tools/webFetchTool'
import { executeWebSearch } from './tools/webSearchTool'
import { executeGetDynamicTools } from './tools/getDynamicToolsTool'
import { executeCallDynamicTool } from './tools/callDynamicToolTool'
import { executeFetchMcpResource } from './tools/fetchMcpResourceTool'
import { executeAwaitShell } from './tools/awaitShellTool'
import { executeEditNotebook } from './tools/editNotebookTool'
import { executeTask } from './tools/taskTool'
import { notImplemented } from './tools/stubTool'

export type ExecuteToolInput = ParsedToolCall & {
  toolCallId?: string
}

export class ToolExecutor {
  constructor(
    private readonly ctx: AgentToolContext,
    private mode: AgentMode = 'agent'
  ) {}

  setMode(mode: AgentMode): void {
    this.mode = mode
  }

  getMode(): AgentMode {
    return this.mode
  }

  async execute(input: ExecuteToolInput): Promise<ToolResult> {
    const { name, arguments: args, toolCallId } = input
    const schema = getToolSchema(name, this.mode)

    if (!schema) {
      return {
        toolCallId,
        name,
        content: `Error: Unknown tool "${name}" for mode ${this.mode}`,
        isError: true
      }
    }

    const missing = validateRequiredArgs(schema, args)
    if (missing.length > 0) {
      return {
        toolCallId,
        name,
        content: `Error: Missing required parameter(s): ${missing.join(', ')}`,
        isError: true
      }
    }

    const modeError = checkModeToolPolicy(this.mode, name, args)
    if (modeError) {
      return { toolCallId, name, content: modeError, isError: true }
    }

    if (this.ctx.allowedTools && !this.ctx.allowedTools.has(name)) {
      return {
        toolCallId,
        name,
        content: `Error: Tool "${name}" is not allowed for this subagent`,
        isError: true,
      }
    }

    try {
      const raw = await this.dispatch(name, args)
      return normalizeToolDispatch(name, raw, toolCallId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { toolCallId, name, content: `Error: ${message}`, isError: true }
    }
  }

  async executeMany(calls: ExecuteToolInput[]): Promise<ToolResult[]> {
    return Promise.all(calls.map((call) => this.execute(call)))
  }

  private async dispatch(name: string, args: Record<string, unknown>): Promise<ToolDispatchResult> {
    switch (name) {
      case 'Read':
        return executeRead(this.ctx, args)
      case 'Write':
        return executeWrite(this.ctx, args)
      case 'StrReplace':
        return executeStrReplace(this.ctx, args)
      case 'Delete':
        return executeDelete(this.ctx, args)
      case 'Glob':
        return executeGlob(this.ctx, args)
      case 'Grep':
        return executeGrep(this.ctx, args)
      case 'Shell':
        if (!this.ctx.shellService) return 'Error: Shell service not available'
        return executeShell(this.ctx, this.ctx.shellService, args)
      case 'AwaitShell':
        if (!this.ctx.shellService) return 'Error: Shell service not available'
        return executeAwaitShell(this.ctx, this.ctx.shellService, args)
      case 'CreatePlan':
        return executeCreatePlan(this.ctx, args)
      case 'AskQuestion':
        return executeAskQuestion(this.ctx, args)
      case 'TodoWrite':
        return executeTodoWrite(this.ctx, args)
      case 'ReadLints':
        return executeReadLints(this.ctx, args)
      case 'SwitchMode':
        return executeSwitchMode(this.ctx, args)
      case 'WebFetch':
        return executeWebFetch(this.ctx, args)
      case 'WebSearch':
        return executeWebSearch(this.ctx, args)
      case 'EditNotebook':
        return executeEditNotebook(this.ctx, args)
      case 'GetDynamicTools':
        return executeGetDynamicTools(this.ctx, args)
      case 'CallDynamicTool':
        return executeCallDynamicTool(this.ctx, args)
      case 'FetchMcpResource':
        return executeFetchMcpResource(this.ctx, args)
      case 'Task':
        return executeTask(this.ctx, args)
      default:
        return notImplemented(name)
    }
  }
}

function validateRequiredArgs(
  schema: { function: { parameters: { required?: readonly string[] } } },
  args: Record<string, unknown>
): string[] {
  const required = schema.function.parameters.required ?? []
  return required.filter((key) => {
    const val = args[key]
    return val === undefined || val === null || val === ''
  })
}

export function createToolExecutor(ctx: AgentToolContext, mode: AgentMode = 'agent'): ToolExecutor {
  return new ToolExecutor(ctx, mode)
}
