import type {
  FileNode, WorkspaceInfo, ApiModelConfig, ApiModelInput, GenerateOptions,
  FimRequest, GitFileStatus, GitRepoInfo, GitHubRepo, GitHubPR,
  CreatePROptions, AppSettings, ChatMessage, ChatSessionsData, ImageAttachment
} from '../../../shared/types'
import type {
  AgentExecuteToolPayload, AgentMode, AgentRunPayload, AgentRunResult,
  AgentToolEvent, ParsedToolCall, ToolResult
} from '../../../shared/agent/types'

declare global {
  interface Window {
    api: {
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      onWindowMaximizeChanged: (cb: (maximized: boolean) => void) => () => void

      getFileTree: (dirPath: string) => Promise<FileNode[]>
      readFile: (filePath: string) => Promise<string>
      writeFile: (filePath: string, content: string) => Promise<void>
      createFile: (filePath: string) => Promise<void>
      createDirectory: (dirPath: string) => Promise<void>
      deleteFile: (targetPath: string) => Promise<void>
      removeEmptyDir: (dirPath: string) => Promise<boolean>
      renameFile: (oldPath: string, newPath: string) => Promise<void>
      watchDir: (dirPath: string) => Promise<void>
      unwatchDir: (dirPath: string) => Promise<void>
      onFsChanged: (cb: (payload: { eventType: string; filePath: string }) => void) => () => void

      pickImageFiles: () => Promise<ImageAttachment[]>
      openFolderDialog: () => Promise<WorkspaceInfo | null>
      openFolder: (folderPath: string) => Promise<WorkspaceInfo>
      getRecentWorkspaces: () => Promise<WorkspaceInfo[]>
      closeWorkspace: () => Promise<void>

      loadModel: (modelId: string) => Promise<void>
      unloadModel: () => Promise<void>
      clearHistory: () => Promise<void>
      restoreChatHistory: (messages: ChatMessage[]) => Promise<void>
      getLlmStatus: () => Promise<{ isLoaded: boolean; modelName: string | null }>
      fimComplete: (req: FimRequest) => Promise<string>
      generateStream: (
        prompt: string,
        opts: GenerateOptions,
        onToken: (token: string) => void,
        onDone: () => void,
        onError: (err: string) => void
      ) => Promise<() => void>

      listModels: () => Promise<ApiModelConfig[]>
      addModel: (input: ApiModelInput) => Promise<ApiModelConfig>
      updateModel: (id: string, input: ApiModelInput) => Promise<ApiModelConfig>
      removeModel: (id: string) => Promise<void>

      gitInfo: (cwd: string) => Promise<GitRepoInfo>
      gitStatus: (cwd: string) => Promise<GitFileStatus[]>
      gitStage: (cwd: string, filePath: string) => Promise<void>
      gitStageAll: (cwd: string) => Promise<void>
      gitUnstage: (cwd: string, filePath: string) => Promise<void>
      gitCommit: (cwd: string, message: string, name: string, email: string) => Promise<string>
      gitPush: (cwd: string, pat?: string) => Promise<void>
      gitPull: (cwd: string, pat?: string) => Promise<void>
      gitBranches: (cwd: string) => Promise<string[]>
      gitCheckout: (cwd: string, branch: string, create?: boolean) => Promise<void>
      gitInit: (cwd: string) => Promise<void>
      gitDiff: (cwd: string, filePath: string) => Promise<string>

      githubAuth: (pat: string) => Promise<string>
      githubLogout: () => void
      githubStatus: () => Promise<{ isAuthenticated: boolean; username: string | null }>
      githubRepos: () => Promise<GitHubRepo[]>
      githubPRs: (owner: string, repo: string) => Promise<GitHubPR[]>
      githubCreatePR: (opts: CreatePROptions) => Promise<GitHubPR>

      getSettings: () => Promise<AppSettings>
      setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
      saveChatHistory: (messages: ChatMessage[]) => Promise<void>
      loadChatHistory: () => Promise<ChatMessage[]>
      saveChatSessions: (data: ChatSessionsData) => Promise<void>
      loadChatSessions: () => Promise<ChatSessionsData>

      termCreate: (id: string, cwd: string) => Promise<{ cols: number; rows: number }>
      termWrite: (id: string, data: string) => void
      termResize: (id: string, cols: number, rows: number) => void
      termKill: (id: string) => void
      onTermData: (id: string, cb: (data: string) => void) => () => void

      agentExecuteTool: (payload: AgentExecuteToolPayload) => Promise<ToolResult>
      agentExecuteTools: (payload: {
        calls: AgentExecuteToolPayload[]
        sessionId?: string
        mode?: AgentMode
      }) => Promise<ToolResult[]>
      agentParseToolCalls: (text: string) => Promise<ParsedToolCall[]>
      agentClearSession: (sessionId: string) => Promise<void>
      agentRestoreSession: (
        sessionId: string,
        messages: import('../../../../shared/agent/agentChatMessages').AgentChatMessage[] | null | undefined
      ) => Promise<void>
      agentGetSessionMessages: (
        sessionId: string
      ) => Promise<import('../../../../shared/agent/agentChatMessages').AgentChatMessage[] | null>
      submitAskQuestion: (payload: {
        runId: string
        requestId: string
        answers: import('../../../../shared/agent/types').AskQuestionAnswers
      }) => Promise<boolean>
      submitSwitchMode: (payload: {
        runId: string
        requestId: string
        approved: boolean
        targetModeId: import('../../../../shared/agent/types').AgentMode
      }) => Promise<boolean>
      getMcpConfig: (scope?: 'user' | 'workspace') => Promise<{
        path: string | null
        config: { mcpServers?: Record<string, unknown> }
        exists: boolean
        parseError?: boolean
      }>
      setMcpConfig: (payload: {
        scope: 'user' | 'workspace'
        config: { mcpServers?: Record<string, unknown> }
      }) => Promise<{ path: string; ok: boolean }>
      onAgentShellOutput: (
        sessionId: string,
        cb: (payload: { command: string; data: string; shellId?: string; stderr?: boolean }) => void
      ) => () => void
      agentRunStart: (
        payload: AgentRunPayload,
        onStepStart: (step: number, maxSteps: number) => void,
        onToken: (token: string) => void,
        onReasoningToken: (token: string) => void,
        onContextUsage: (usage: import('../../../../shared/agent/types').AgentCompletionUsage) => void,
        onAskQuestion: (question: import('../../../../shared/agent/types').PendingAskQuestion) => void,
        onSwitchMode: (request: import('../../../../shared/agent/types').PendingSwitchMode) => void,
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
      ) => Promise<() => void>
    }
  }
}

export {}
