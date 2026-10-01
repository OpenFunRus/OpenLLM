import type { AgentContentPart } from './agentChatMessages'
import type { AgentMode, AgentUserContext } from './types'
import { buildModeReminder } from './modeReminders'

/** Format local timestamp like Cursor: `Wednesday, Sep 30, 2026, 2:16 PM (UTC+4)` */
export function formatLocalTimestamp(date: Date, timezoneOffsetMinutes?: number): string {
  const offsetMin = timezoneOffsetMinutes ?? -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const hours = Math.floor(abs / 60)
  const mins = abs % 60
  const tzLabel = mins === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(mins).padStart(2, '0')}`

  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  const monthDayYear = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return `${weekday}, ${monthDayYear}, ${time} (${tzLabel})`
}

export function formatTodayDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export type RuntimeEnvironment = {
  osPlatform: string
  osRelease: string
  shell: string
  appName: string
}

export function buildUserInfoBlock(
  ctx: AgentUserContext,
  runtime: RuntimeEnvironment,
  now = new Date()
): string {
  const lines = [
    `OS Version: ${runtime.osPlatform} ${runtime.osRelease}`,
    '',
    `Shell: ${runtime.shell}`,
    '',
    `Workspace Path: ${ctx.workspacePath ?? '(no folder open)'}`,
    '',
    formatGitLine(ctx),
    '',
    `Today's date: ${formatTodayDate(now)}`,
  ]

  if (ctx.terminalsFolder) {
    lines.push('', `Terminals folder: ${ctx.terminalsFolder}`)
  }

  return `<user_info>\n${lines.join('\n')}\n</user_info>`
}

function formatGitLine(ctx: AgentUserContext): string {
  if (ctx.isGitRepo === null || ctx.isGitRepo === undefined) {
    return 'Is directory a git repo: Unknown (git repository detection still warming)'
  }
  if (!ctx.isGitRepo) return 'Is directory a git repo: No'
  if (ctx.workspacePath) {
    return `Is directory a git repo: Yes, at ${ctx.workspacePath}`
  }
  const branch = ctx.gitBranch ? `, branch: ${ctx.gitBranch}` : ''
  return `Is directory a git repo: Yes${branch}`
}

export function buildAgentTranscriptsBlock(ctx: AgentUserContext): string | null {
  if (!ctx.agentTranscriptsPath) return null
  return `<agent_transcripts>
Agent transcripts (past chats) live in ${ctx.agentTranscriptsPath}. They have names like <uuid>.jsonl, cite parent chat transcripts to the user as [<title for chat <=6 words>](<uuid excluding .jsonl>). Don't discuss the folder structure.
</agent_transcripts>`
}

export function buildAgentSkillsBlock(ctx: AgentUserContext): string | null {
  const skills = ctx.agentSkills ?? []
  if (skills.length === 0) return null

  const lines = [
    '<agent_skills>',
    'When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge. To use a skill, read the skill file at the provided absolute path using the Read tool, then follow the instructions within. When a skill is relevant, read and follow it IMMEDIATELY as your first action. NEVER just announce or mention a skill without actually reading and following it. Only use skills listed below.',
    '',
    '',
    '<available_skills description="Skills the agent can use. Use the Read tool with the provided absolute path to fetch full contents.">',
  ]

  for (const skill of skills) {
    lines.push(`<agent_skill fullPath="${skill.fullPath}">${skill.description}</agent_skill>`, '')
  }

  lines.push('</available_skills>', '</agent_skills>')
  return lines.join('\n')
}

export function buildDynamicToolCatalogBlock(ctx: AgentUserContext): string | null {
  const namespaces = ctx.dynamicToolNamespaces ?? []
  if (namespaces.length === 0) return null

  const lines = [
    '<dynamic_tool_catalog>',
    'These dynamic tool namespaces were available when this conversation started. Availability may have changed, so use `GetDynamicTools` to check current state before calling `CallDynamicTool`.',
    '',
    '<dynamic_tool_namespaces>',
  ]

  for (const ns of namespaces) {
    const source = ns.source ? ` source="${ns.source}"` : ''
    lines.push(`<namespace name="${ns.name}" tools="${ns.tools}"${source} />`)
  }

  lines.push('</dynamic_tool_namespaces>', '</dynamic_tool_catalog>')
  return lines.join('\n')
}

/** Session bootstrap user message — sent once per agent session (Cursor message #2). */
export function buildBootstrapUserMessage(
  ctx: AgentUserContext,
  runtime: RuntimeEnvironment,
  mode: AgentMode = 'agent',
  now = new Date()
): string {
  const parts: string[] = [buildUserInfoBlock(ctx, runtime, now)]

  const transcripts = buildAgentTranscriptsBlock(ctx)
  if (transcripts) {
    parts.push('', transcripts)
  }

  const skills = buildAgentSkillsBlock(ctx)
  if (skills) {
    parts.push('', skills)
  }

  if (mode === 'agent' || mode === 'plan') {
    const catalog = buildDynamicToolCatalogBlock(ctx)
    if (catalog) {
      parts.push('', catalog)
    }
  }

  return parts.join('\n')
}

export function buildOpenFilesBlock(ctx: AgentUserContext): string {
  const open = ctx.openFiles ?? []
  const recent = ctx.recentlyViewedFiles ?? []

  if (open.length === 0 && recent.length === 0) {
    return `<open_and_recently_viewed_files>
User currently doesn't have any open files in their IDE.

Note: these files may or may not be relevant to the current conversation. Use the Read tool if you need to get the contents of some of them.
</open_and_recently_viewed_files>`
  }

  const lines: string[] = []
  if (open.length > 0) {
    for (const f of open) {
      const active = f.isActive ? ' (active' : ' ('
      const cursor = f.cursorLine !== undefined ? `, cursor line ${f.cursorLine}` : ''
      lines.push(`- ${f.path}${active}${cursor})`)
    }
  } else {
    lines.push("User currently doesn't have any open files in their IDE.")
  }

  if (recent.length > 0) {
    lines.push('', 'Recently viewed files (recent at the top, oldest at the bottom):')
    for (const p of recent) {
      lines.push(`- ${p}`)
    }
  }

  lines.push(
    '',
    'Note: these files may or may not be relevant to the current conversation. Use the Read tool if you need to get the contents of some of them.'
  )

  return `<open_and_recently_viewed_files>\n${lines.join('\n')}\n</open_and_recently_viewed_files>`
}

/** Per-turn user message — multipart content (Cursor message #3+). */
export function buildTurnUserMessage(
  userQuery: string,
  ctx: AgentUserContext,
  mode: AgentMode = 'agent',
  now = new Date()
): AgentContentPart[] {
  const parts: AgentContentPart[] = [{ type: 'text', text: buildOpenFilesBlock(ctx) }]

  const reminder = buildModeReminder(mode)
  if (reminder) {
    parts.push({ type: 'text', text: `\n\n${reminder}` })
  }

  parts.push({
    type: 'text',
    text: `<timestamp>${formatLocalTimestamp(now, ctx.timezoneOffsetMinutes)}</timestamp>\n<user_query>\n${userQuery.trim()}\n</user_query>`,
  })

  return parts
}

/** @deprecated Use buildBootstrapUserMessage + buildTurnUserMessage */
export function buildAgentUserMessage(
  userQuery: string,
  ctx: AgentUserContext,
  runtime: RuntimeEnvironment,
  now = new Date()
): string {
  const parts = [
    buildUserInfoBlock(ctx, runtime, now),
    '',
    buildOpenFilesBlock(ctx),
    `<timestamp>${formatLocalTimestamp(now, ctx.timezoneOffsetMinutes)}</timestamp>`,
    `<user_query>\n${userQuery.trim()}\n</user_query>`,
  ]
  return parts.join('\n')
}
