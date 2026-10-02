import { contextBridge, ipcRenderer } from 'electron'
import type {
  FileNode, WorkspaceInfo, GenerateOptions,
  FimRequest, GitFileStatus, GitRepoInfo, GitHubRepo, GitHubPR,
  CreatePROptions, AppSettings, ChatMessage, ChatSessionsData, ImageAttachment,
  ApiModelConfig, ApiModelInput
} from '../shared/types'
import type {
  AgentCompletionUsage,
  AgentExecuteToolPayload,
  AgentMode,
  AgentRunPayload,
  AgentRunResult,
  AgentToolEvent,
  AskQuestionAnswers,
  PendingAskQuestion,
  PendingSwitchMode,
  ParsedToolCall,
  ToolResult,
} from '../shared/agent/types'

contextBridge.exposeInMainWorld('api', {
  // ── Window controls ─────────────────────────────────────────────────
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  // ── File system ─────────────────────────────────────────────────────
  getFileTree: (dirPath: string): Promise<FileNode[]> =>
    ipcRenderer.invoke('fs:tree', dirPath),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write', filePath, content),
  createFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:create', filePath),
  createDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:mkdir', dirPath),
  deleteFile: (targetPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:delete', targetPath),
  removeEmptyDir: (dirPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:removeIfEmpty', dirPath),
  renameFile: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),
  watchDir: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:watch', dirPath),
  unwatchDir: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:unwatch', dirPath),
  onFsChanged: (cb: (payload: { eventType: string; filePath: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { eventType: string; filePath: string }) => cb(payload)
    ipcRenderer.on('fs:changed', handler)
    return () => ipcRenderer.off('fs:changed', handler)
  },

  // ── Workspace ───────────────────────────────────────────────────────
  pickImageFiles: (): Promise<ImageAttachment[]> =>
    ipcRenderer.invoke('dialog:pickImages'),
  openFolderDialog: (): Promise<WorkspaceInfo | null> =>
    ipcRenderer.invoke('workspace:openDialog'),
  openFolder: (folderPath: string): Promise<WorkspaceInfo> =>
    ipcRenderer.invoke('workspace:open', folderPath),
  getRecentWorkspaces: (): Promise<WorkspaceInfo[]> =>
    ipcRenderer.invoke('workspace:recent'),
  closeWorkspace: (): Promise<void> =>
    ipcRenderer.invoke('workspace:close'),

  // ── LLM ─────────────────────────────────────────────────────────────
  loadModel: (modelId: string): Promise<void> =>
    ipcRenderer.invoke('llm:load', modelId),
  unloadModel: (): Promise<void> =>
    ipcRenderer.invoke('llm:unload'),
  clearHistory: (): Promise<void> =>
    ipcRenderer.invoke('llm:clearHistory'),
  restoreChatHistory: (messages: ChatMessage[]): Promise<void> =>
    ipcRenderer.invoke('llm:restoreHistory', messages),
  getLlmStatus: (): Promise<{ isLoaded: boolean; modelName: string | null }> =>
    ipcRenderer.invoke('llm:status'),
  fimComplete: (req: FimRequest): Promise<string> =>
    ipcRenderer.invoke('llm:fim', req),
  generateStream: async (
    prompt: string,
    opts: GenerateOptions,
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: string) => void
  ): Promise<() => void> => {
    const id: string = await ipcRenderer.invoke('llm:generateStart', prompt, opts)
    const tokenHandler = (_e: Electron.IpcRendererEvent, token: string) => onToken(token)
    const doneHandler = () => { cleanup(); onDone() }
    const errorHandler = (_e: Electron.IpcRendererEvent, err: string) => { cleanup(); onError(err) }
    const cleanup = () => {
      ipcRenderer.off(`llm:token:${id}`, tokenHandler)
      ipcRenderer.off(`llm:done:${id}`, doneHandler)
      ipcRenderer.off(`llm:error:${id}`, errorHandler)
    }
    ipcRenderer.on(`llm:token:${id}`, tokenHandler)
    ipcRenderer.on(`llm:done:${id}`, doneHandler)
    ipcRenderer.on(`llm:error:${id}`, errorHandler)
    return () => { ipcRenderer.emit(`llm:abort:${id}`); cleanup() }
  },

  // ── Model manager ────────────────────────────────────────────────────
  listModels: (): Promise<ApiModelConfig[]> =>
    ipcRenderer.invoke('model:list'),
  addModel: (input: ApiModelInput): Promise<ApiModelConfig> =>
    ipcRenderer.invoke('model:add', input),
  updateModel: (id: string, input: ApiModelInput): Promise<ApiModelConfig> =>
    ipcRenderer.invoke('model:update', id, input),
  removeModel: (id: string): Promise<void> =>
    ipcRenderer.invoke('model:remove', id),

  // ── Git ──────────────────────────────────────────────────────────────
  gitInfo: (cwd: string): Promise<GitRepoInfo> =>
    ipcRenderer.invoke('git:info', cwd),
  gitStatus: (cwd: string): Promise<GitFileStatus[]> =>
    ipcRenderer.invoke('git:status', cwd),
  gitStage: (cwd: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke('git:stage', cwd, filePath),
  gitStageAll: (cwd: string): Promise<void> =>
    ipcRenderer.invoke('git:stageAll', cwd),
  gitUnstage: (cwd: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke('git:unstage', cwd, filePath),
  gitCommit: (cwd: string, message: string, name: string, email: string): Promise<string> =>
    ipcRenderer.invoke('git:commit', cwd, message, name, email),
  gitPush: (cwd: string, pat?: string): Promise<void> =>
    ipcRenderer.invoke('git:push', cwd, pat),
  gitPull: (cwd: string, pat?: string): Promise<void> =>
    ipcRenderer.invoke('git:pull', cwd, pat),
  gitBranches: (cwd: string): Promise<string[]> =>
    ipcRenderer.invoke('git:branches', cwd),
  gitCheckout: (cwd: string, branch: string, create?: boolean): Promise<void> =>
    ipcRenderer.invoke('git:checkout', cwd, branch, create ?? false),
  gitInit: (cwd: string): Promise<void> =>
    ipcRenderer.invoke('git:init', cwd),
  gitDiff: (cwd: string, filePath: string): Promise<string> =>
    ipcRenderer.invoke('git:diff', cwd, filePath),

  // ── GitHub ───────────────────────────────────────────────────────────
  githubAuth: (pat: string): Promise<string> =>
    ipcRenderer.invoke('github:auth', pat),
  githubLogout: (): void =>
    ipcRenderer.invoke('github:logout'),
  githubStatus: (): Promise<{ isAuthenticated: boolean; username: string | null }> =>
    ipcRenderer.invoke('github:status'),
  githubRepos: (): Promise<GitHubRepo[]> =>
    ipcRenderer.invoke('github:repos'),
  githubPRs: (owner: string, repo: string): Promise<GitHubPR[]> =>
    ipcRenderer.invoke('github:prs', owner, repo),
  githubCreatePR: (opts: CreatePROptions): Promise<GitHubPR> =>
    ipcRenderer.invoke('github:createPr', opts),

  // ── Settings ─────────────────────────────────────────────────────────
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:getAll'),
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> =>
    ipcRenderer.invoke('settings:set', key, value),
  saveChatHistory: (messages: ChatMessage[]): Promise<void> =>
    ipcRenderer.invoke('chat:save', messages),
  loadChatHistory: (): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('chat:load'),
  saveChatSessions: (data: ChatSessionsData): Promise<void> =>
    ipcRenderer.invoke('chat:saveSessions', data),
  loadChatSessions: (): Promise<ChatSessionsData> =>
    ipcRenderer.invoke('chat:loadSessions'),

  // ── Terminal ─────────────────────────────────────────────────────────
  termCreate: (id: string, cwd: string): Promise<{ cols: number; rows: number }> =>
    ipcRenderer.invoke('term:create', id, cwd),
  termWrite: (id: string, data: string): void => {
    ipcRenderer.invoke('term:write', id, data)
  },
  termResize: (id: string, cols: number, rows: number): void => {
    ipcRenderer.invoke('term:resize', id, cols, rows)
  },
  termKill: (id: string): void => {
    ipcRenderer.invoke('term:kill', id)
  },
  onTermData: (id: string, cb: (data: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: string) => cb(data)
    ipcRenderer.on(`term:data:${id}`, handler)
    return () => ipcRenderer.off(`term:data:${id}`, handler)
  },

  // ── Agent tools (Cursor XML format) ─────────────────────────────────
  agentExecuteTool: (payload: AgentExecuteToolPayload): Promise<ToolResult> =>
    ipcRenderer.invoke('agent:executeTool', payload),
  agentExecuteTools: (payload: {
    calls: AgentExecuteToolPayload[]
    sessionId?: string
    mode?: AgentMode
  }): Promise<ToolResult[]> =>
    ipcRenderer.invoke('agent:executeTools', payload),
  agentParseToolCalls: (text: string): Promise<ParsedToolCall[]> =>
    ipcRenderer.invoke('agent:parseToolCalls', text),
  agentClearSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('agent:clearSession', sessionId),
  agentRestoreSession: (
    sessionId: string,
    messages: import('../shared/agent/agentChatMessages').AgentChatMessage[] | null | undefined
  ): Promise<void> => ipcRenderer.invoke('agent:restoreSession', sessionId, messages),
  agentGetSessionMessages: (
    sessionId: string
  ): Promise<import('../shared/agent/agentChatMessages').AgentChatMessage[] | null> =>
    ipcRenderer.invoke('agent:getSessionMessages', sessionId),

  submitAskQuestion: (payload: {
    runId: string
    requestId: string
    answers: AskQuestionAnswers
  }): Promise<boolean> => ipcRenderer.invoke('agent:askQuestionSubmit', payload),

  submitSwitchMode: (payload: {
    runId: string
    requestId: string
    approved: boolean
    targetModeId: import('../shared/agent/types').AgentMode
  }): Promise<boolean> => ipcRenderer.invoke('agent:switchModeSubmit', payload),

  getMcpConfig: (scope: 'user' | 'workspace' = 'user'): Promise<{
    path: string | null
    config: { mcpServers?: Record<string, unknown> }
    exists: boolean
    parseError?: boolean
  }> => ipcRenderer.invoke('mcp:getConfig', scope),

  setMcpConfig: (payload: {
    scope: 'user' | 'workspace'
    config: { mcpServers?: Record<string, unknown> }
  }): Promise<{ path: string; ok: boolean }> => ipcRenderer.invoke('mcp:setConfig', payload),

  onAgentShellOutput: (
    sessionId: string,
    cb: (payload: { command: string; data: string; shellId?: string; stderr?: boolean }) => void
  ): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      payload: { command: string; data: string; shellId?: string; stderr?: boolean }
    ) => cb(payload)
    ipcRenderer.on(`agent:shellOutput:${sessionId}`, handler)
    return () => ipcRenderer.off(`agent:shellOutput:${sessionId}`, handler)
  },

  agentRunStart: async (
    payload: AgentRunPayload,
    onStepStart: (step: number, maxSteps: number) => void,
    onToken: (token: string) => void,
    onReasoningToken: (token: string) => void,
    onContextUsage: (usage: AgentCompletionUsage) => void,
    onAskQuestion: (question: PendingAskQuestion) => void,
    onSwitchMode: (request: PendingSwitchMode) => void,
    onBackgroundTaskDone: (payload: {
      agentId: string
      subagentType: string
      description: string
      status: 'done' | 'error'
      response?: string
      error?: string
      steps?: number
    }) => void,
    onStep: (step: number, maxSteps: number, thinking: string | null) => void,
    onTool: (event: AgentToolEvent) => void,
    onDone: (result: AgentRunResult) => void,
    onError: (err: string) => void
  ): Promise<() => void> => {
    const id: string = await ipcRenderer.invoke('agent:runStart', payload)
    const stepStartHandler = (
      _e: Electron.IpcRendererEvent,
      data: { step: number; maxSteps: number }
    ) => onStepStart(data.step, data.maxSteps)
    const tokenHandler = (_e: Electron.IpcRendererEvent, token: string) => onToken(token)
    const reasoningHandler = (_e: Electron.IpcRendererEvent, token: string) => onReasoningToken(token)
    const usageHandler = (_e: Electron.IpcRendererEvent, usage: AgentCompletionUsage) => onContextUsage(usage)
    const askQuestionHandler = (
      _e: Electron.IpcRendererEvent,
      data: PendingAskQuestion
    ) => onAskQuestion({ ...data, runId: data.runId ?? id })
    const switchModeHandler = (
      _e: Electron.IpcRendererEvent,
      data: PendingSwitchMode
    ) => onSwitchMode({ ...data, runId: data.runId ?? id })
    const taskDoneHandler = (
      _e: Electron.IpcRendererEvent,
      data: {
        agentId: string
        subagentType: string
        description: string
        status: 'done' | 'error'
        response?: string
        error?: string
        steps?: number
      }
    ) => onBackgroundTaskDone(data)
    const stepHandler = (
      _e: Electron.IpcRendererEvent,
      data: { step: number; maxSteps: number; thinking: string | null }
    ) => onStep(data.step, data.maxSteps, data.thinking)
    const toolHandler = (_e: Electron.IpcRendererEvent, event: AgentToolEvent) => onTool(event)
    const doneHandler = (_e: Electron.IpcRendererEvent, result: AgentRunResult) => { cleanup(); onDone(result) }
    const errorHandler = (_e: Electron.IpcRendererEvent, err: string) => { cleanup(); onError(err) }
    const cleanup = () => {
      ipcRenderer.off(`agent:stepStart:${id}`, stepStartHandler)
      ipcRenderer.off(`agent:token:${id}`, tokenHandler)
      ipcRenderer.off(`agent:reasoning:${id}`, reasoningHandler)
      ipcRenderer.off(`agent:usage:${id}`, usageHandler)
      ipcRenderer.off(`agent:askQuestion:${id}`, askQuestionHandler)
      ipcRenderer.off(`agent:switchMode:${id}`, switchModeHandler)
      ipcRenderer.off(`agent:taskDone:${id}`, taskDoneHandler)
      ipcRenderer.off(`agent:step:${id}`, stepHandler)
      ipcRenderer.off(`agent:tool:${id}`, toolHandler)
      ipcRenderer.off(`agent:done:${id}`, doneHandler)
      ipcRenderer.off(`agent:error:${id}`, errorHandler)
    }
    ipcRenderer.on(`agent:stepStart:${id}`, stepStartHandler)
    ipcRenderer.on(`agent:token:${id}`, tokenHandler)
    ipcRenderer.on(`agent:reasoning:${id}`, reasoningHandler)
    ipcRenderer.on(`agent:usage:${id}`, usageHandler)
    ipcRenderer.on(`agent:askQuestion:${id}`, askQuestionHandler)
    ipcRenderer.on(`agent:switchMode:${id}`, switchModeHandler)
    ipcRenderer.on(`agent:taskDone:${id}`, taskDoneHandler)
    ipcRenderer.on(`agent:step:${id}`, stepHandler)
    ipcRenderer.on(`agent:tool:${id}`, toolHandler)
    ipcRenderer.on(`agent:done:${id}`, doneHandler)
    ipcRenderer.on(`agent:error:${id}`, errorHandler)
    return () => { ipcRenderer.emit(`agent:abort:${id}`); cleanup() }
  },
})
