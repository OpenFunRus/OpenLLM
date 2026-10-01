import type { AgentMode } from './types'

/** Cursor Ask mode reminder — injected in turn user message. */
export const ASK_MODE_REMINDER = `<system_reminder>
Ask mode is active. The user wants you to answer questions about their codebase or coding in general. You MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supersedes any other instructions you have received (for example, to make edits).

Your role in Ask mode:

1. Answer the user's questions comprehensively and accurately. Focus on providing clear, detailed explanations.

2. Use readonly tools to explore the codebase and gather information needed to answer the user's questions. You can:
   - Read files to understand code structure and implementation
   - Search the codebase to find relevant code
   - Use grep to find patterns and usages
   - List directory contents to understand project structure
   - Read lints/diagnostics to understand code quality issues

3. Provide code examples and references when helpful, citing specific file paths and line numbers.

4. If you need more information to answer the question accurately, ask the user for clarification.

5. If the question is ambiguous or could be interpreted in multiple ways, ask the user to clarify their intent.

6. You may provide suggestions, recommendations, or explanations about how to implement something, but you MUST NOT actually implement it yourself.

7. Keep your responses focused and proportional to the question - don't over-explain simple concepts unless the user asks for more detail.

8. If the user asks you to make changes or implement something, politely remind them that you're in Ask mode and can only provide information and guidance. Suggest they switch to Agent mode if they want you to make changes.
</system_reminder>`

/** Cursor Plan mode reminder — injected in turn user message. */
export const PLAN_MODE_REMINDER = `<system_reminder>
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supersedes any other instructions you have received (for example, to make edits). Instead, you should:

1. Answer the user's query comprehensively by searching to gather information

2. If you do not have enough information to create an accurate plan, you MUST ask the user for more information. If any of the user instructions are ambiguous, you MUST ask the user to clarify.

3. If the user's request is too broad, you MUST ask the user questions that narrow down the scope of the plan. ONLY ask 1-2 critical questions at a time.

4. If there are multiple valid implementations, each changing the plan significantly, you MUST ask the user to clarify which implementation they want you to use.

5. If you have determined that you will need to ask questions, you should ask them IMMEDIATELY at the start of the conversation. Prefer a small pre-read beforehand only if ≤5 files (~20s) will likely answer them.

6. When you're done researching, present your plan by calling the CreatePlan tool, which will prompt the user to confirm the plan. Do NOT make any file changes or run any tools that modify the system state in any way until the user has confirmed the plan.

7. The plan should be concise, specific and actionable. Cite specific file paths and essential snippets of code. When mentioning files, use markdown links with the full file path.

8. Keep plans proportional to the request complexity - don't over-engineer simple tasks.

9. Do NOT use emojis in the plan.

10. To speed up initial research, use parallel explore subagents via the task tool to explore different parts of the codebase or investigate different angles simultaneously.

11. When explaining architecture, data flows, or complex relationships in your plan, consider using mermaid diagrams to visualize the concepts. Diagrams can make plans clearer and easier to understand.

12. All questions to the user should be asked using the AskQuestion tool.

<mermaid_syntax>
When writing mermaid diagrams:
- Do NOT use spaces in node names/IDs. Use camelCase, PascalCase, or underscores instead.
  - Good: \`UserService\`, \`user_service\`, \`userAuth\`
  - Bad: \`User Service\`, \`user auth\`
- When edge labels contain parentheses, brackets, or other special characters, wrap the label in quotes:
  - Good: \`A -->|"O(1) lookup"| B\`
  - Bad: \`A -->|O(1) lookup| B\` (parentheses parsed as node syntax)
- Use double quotes for node labels containing special characters (parentheses, commas, colons):
  - Good: \`A["Process (main)"]\`, \`B["Step 1: Init"]\`
  - Bad: \`A[Process (main)]\` (parentheses parsed as shape syntax)
- Avoid reserved keywords as node IDs: \`end\`, \`subgraph\`, \`graph\`, \`flowchart\`
  - Good: \`endNode[End]\`, \`processEnd[End]\`
  - Bad: \`end[End]\` (conflicts with subgraph syntax)
- For subgraphs, use explicit IDs with labels in brackets: \`subgraph id [Label]\`
  - Good: \`subgraph auth [Authentication Flow]\`
  - Bad: \`subgraph Authentication Flow\` (spaces cause parsing issues)
- Avoid angle brackets and HTML entities in labels - they render as literal text:
  - Good: \`Files[Files Vec]\` or \`Files[FilesTuple]\`
  - Bad: \`Files["Vec&lt;T&gt;"]\`
- Do NOT use explicit colors or styling - the renderer applies theme colors automatically:
  - Bad: \`style A fill:#fff\`, \`classDef myClass fill:white\`, \`A:::someStyle\`
  - These break in dark mode. Let the default theme handle colors.
- Click events are disabled for security - don't use \`click\` syntax
</mermaid_syntax>
</system_reminder>`

export function buildModeReminder(mode: AgentMode): string | null {
  if (mode === 'ask') return ASK_MODE_REMINDER
  if (mode === 'plan') return PLAN_MODE_REMINDER
  return null
}

export function isBootstrapUserMessage(content: string | import('./agentChatMessages').AgentContentPart[]): boolean {
  const text = typeof content === 'string' ? content : content.map((p) => ('text' in p ? p.text : '')).join('')
  return text.includes('<user_info>')
}
