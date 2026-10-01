import fs from 'fs'
import path from 'path'
import type { App } from 'electron'

export type McpServerConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export type McpConfigFile = {
  mcpServers?: Record<string, McpServerConfig>
}

type McpToolInfo = {
  name: string
  description?: string
  inputSchema?: unknown
}

type ConnectedMcpServer = {
  namespace: string
  config: McpServerConfig
  client: import('@modelcontextprotocol/sdk/client/index.js').Client
  transport: import('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport
  tools: McpToolInfo[]
  resources: Array<{ uri: string; name?: string; description?: string; mimeType?: string }>
  status: 'ready' | 'needsAuth' | 'error' | 'loading'
  error?: string
}

const CURSOR_NAMESPACE_TOOLS = [
  {
    namespace: 'cursor',
    toolName: 'GenerateImage',
    description: 'Native Cursor image generation — not available in OpenLLM yet.',
    namespaceStatus: 'unavailable' as const,
    source: 'cursor',
  },
]

class McpRegistry {
  private servers = new Map<string, ConnectedMcpServer>()
  private loading = new Map<string, Promise<ConnectedMcpServer | null>>()

  clear(): void {
    for (const server of this.servers.values()) {
      void server.client.close()
      void server.transport.close()
    }
    this.servers.clear()
    this.loading.clear()
  }

  getConfigPaths(workspaceRoot: string | null): string[] {
    const paths: string[] = []
    try {
      const { app } = require('electron') as { app: App }
      paths.push(path.join(app.getPath('userData'), 'mcp.json'))
    } catch {
      /* tests */
    }
    if (workspaceRoot) {
      paths.push(path.join(workspaceRoot, '.openllm', 'mcp.json'))
    }
    return paths
  }

  loadConfig(workspaceRoot: string | null): Record<string, McpServerConfig> {
    const merged: Record<string, McpServerConfig> = {}
    for (const configPath of this.getConfigPaths(workspaceRoot)) {
      try {
        if (!fs.existsSync(configPath)) continue
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as McpConfigFile
        Object.assign(merged, parsed.mcpServers ?? {})
      } catch {
        /* skip invalid config */
      }
    }
    return merged
  }

  listConfiguredNamespaces(workspaceRoot: string | null): string[] {
    return Object.keys(this.loadConfig(workspaceRoot))
  }

  async ensureConnected(namespace: string, workspaceRoot: string | null): Promise<ConnectedMcpServer | null> {
    const existing = this.servers.get(namespace)
    if (existing) return existing

    const pending = this.loading.get(namespace)
    if (pending) return pending

    const promise = this.connect(namespace, workspaceRoot)
    this.loading.set(namespace, promise)
    try {
      return await promise
    } finally {
      this.loading.delete(namespace)
    }
  }

  private async connect(namespace: string, workspaceRoot: string | null): Promise<ConnectedMcpServer | null> {
    const configs = this.loadConfig(workspaceRoot)
    const config = configs[namespace]
    if (!config?.command) return null

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
      cwd: config.cwd,
    })

    const client = new Client({ name: 'openllm', version: '1.0.0' }, { capabilities: {} })

    try {
      await client.connect(transport)
      const toolsResult = await client.listTools()
      let resources: ConnectedMcpServer['resources'] = []
      try {
        const resourcesResult = await client.listResources()
        resources = (resourcesResult.resources ?? []).map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        }))
      } catch {
        /* resources optional */
      }

      const connected: ConnectedMcpServer = {
        namespace,
        config,
        client,
        transport,
        tools: (toolsResult.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        resources,
        status: 'ready',
      }
      this.servers.set(namespace, connected)
      return connected
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const failed: ConnectedMcpServer = {
        namespace,
        config,
        client,
        transport,
        tools: [],
        resources: [],
        status: 'error',
        error: message,
      }
      this.servers.set(namespace, failed)
      return failed
    }
  }

  async getCatalog(workspaceRoot: string | null): Promise<{
    namespaces: Array<{ name: string; source: string; namespaceStatus: string; tools: string[] }>
    tools: Array<{
      namespace: string
      toolName: string
      description: string
      source: string
      namespaceStatus: string
      inputSchema?: unknown
    }>
    mcpServersConfigured: boolean
  }> {
    const configs = this.loadConfig(workspaceRoot)
    const namespaces: Array<{ name: string; source: string; namespaceStatus: string; tools: string[] }> = []
    const tools: Array<{
      namespace: string
      toolName: string
      description: string
      source: string
      namespaceStatus: string
      inputSchema?: unknown
    }> = []

    for (const entry of CURSOR_NAMESPACE_TOOLS) {
      tools.push(entry)
    }
    namespaces.push({
      name: 'cursor',
      source: 'cursor',
      namespaceStatus: 'unavailable',
      tools: CURSOR_NAMESPACE_TOOLS.map((t) => t.toolName),
    })

    for (const namespace of Object.keys(configs)) {
      const server = await this.ensureConnected(namespace, workspaceRoot)
      const status = server?.status ?? 'error'
      const toolNames = server?.tools.map((t) => t.name) ?? []
      namespaces.push({ name: namespace, source: 'mcp', namespaceStatus: status, tools: toolNames })
      for (const tool of server?.tools ?? []) {
        tools.push({
          namespace,
          toolName: tool.name,
          description: tool.description ?? '',
          source: 'mcp',
          namespaceStatus: status,
          inputSchema: tool.inputSchema,
        })
      }
    }

    return {
      namespaces,
      tools,
      mcpServersConfigured: Object.keys(configs).length > 0,
    }
  }

  async callTool(
    namespace: string,
    toolName: string,
    args: Record<string, unknown>,
    workspaceRoot: string | null
  ): Promise<string> {
    if (namespace === 'cursor') {
      return `Error: Cursor namespace tool "${toolName}" is not available in OpenLLM`
    }

    const server = await this.ensureConnected(namespace, workspaceRoot)
    if (!server) {
      return `Error: MCP namespace "${namespace}" is not configured`
    }
    if (server.status === 'needsAuth') {
      return `Error: MCP namespace "${namespace}" requires authentication`
    }
    if (server.status === 'error') {
      return `Error: MCP namespace "${namespace}" failed to connect: ${server.error ?? 'unknown error'}`
    }

    if (toolName === 'mcp_auth') {
      return JSON.stringify({ ok: true, message: 'MCP auth stub — server connected' })
    }

    try {
      const result = await server.client.callTool({ name: toolName, arguments: args })
      return JSON.stringify(result, null, 2)
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  async fetchResource(
    serverName: string,
    uri: string,
    workspaceRoot: string | null
  ): Promise<{ text: string; mimeType?: string }> {
    const server = await this.ensureConnected(serverName, workspaceRoot)
    if (!server || server.status !== 'ready') {
      throw new Error(`MCP server "${serverName}" is not ready`)
    }

    const result = await server.client.readResource({ uri })
    const parts = result.contents ?? []
    const text = parts
      .map((part) => {
        if ('text' in part && typeof part.text === 'string') return part.text
        if ('blob' in part && typeof part.blob === 'string') return `[binary blob: ${part.mimeType ?? 'unknown'}]`
        return ''
      })
      .filter(Boolean)
      .join('\n\n')

    const mimeType = parts.find((p) => 'mimeType' in p)?.mimeType
    return { text: text || '(empty resource)', mimeType }
  }
}

export const mcpRegistry = new McpRegistry()
