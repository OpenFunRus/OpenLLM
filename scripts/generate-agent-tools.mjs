import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const MODES = [
  { mode: 'agent', intercept: 'cursor_agent.txt', exportName: 'CURSOR_AGENT_TOOL_SCHEMAS', namesExport: 'CURSOR_AGENT_TOOL_NAMES', typeName: 'CursorAgentToolName', outFile: 'cursorAgentSchemas.ts', jsonFile: 'agent-tools.json' },
  { mode: 'plan', intercept: 'cursor_plan.txt', exportName: 'CURSOR_PLAN_TOOL_SCHEMAS', namesExport: 'CURSOR_PLAN_TOOL_NAMES', typeName: 'CursorPlanToolName', outFile: 'cursorPlanSchemas.ts', jsonFile: 'plan-tools.json' },
  { mode: 'ask', intercept: 'cursor_ask.txt', exportName: 'CURSOR_ASK_TOOL_SCHEMAS', namesExport: 'CURSOR_ASK_TOOL_NAMES', typeName: 'CursorAskToolName', outFile: 'cursorAskSchemas.ts', jsonFile: 'ask-tools.json' },
]

function extractTools(interceptPath) {
  const text = fs.readFileSync(interceptPath, 'utf8')
  const match = text.match(/<tools>([\s\S]*?)<\/tools>/)
  if (!match) throw new Error(`No <tools> block in ${path.basename(interceptPath)}`)
  return match[1]
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

const toolsDir = path.join(root, 'src/shared/agent/tools')
const docsDir = path.join(root, 'docs/cursor/tools')
fs.mkdirSync(toolsDir, { recursive: true })
fs.mkdirSync(docsDir, { recursive: true })

for (const cfg of MODES) {
  const interceptPath = path.join(root, 'docs/cursor', cfg.intercept)
  const tools = extractTools(interceptPath)
  fs.writeFileSync(path.join(docsDir, cfg.jsonFile), JSON.stringify(tools, null, 2))

  const tsContent = `/** Auto-generated from docs/cursor/${cfg.intercept} — do not edit manually. Run: npm run generate:agent-tools */

import type { CursorToolFunctionSchema } from '../types'

export const ${cfg.exportName} = ${JSON.stringify(tools, null, 2)} as const satisfies readonly CursorToolFunctionSchema[]

export const ${cfg.namesExport} = ${JSON.stringify(
    tools.map((t) => t.function.name),
    null,
    2
  )} as const

export type ${cfg.typeName} = (typeof ${cfg.namesExport})[number]
`

  fs.writeFileSync(path.join(toolsDir, cfg.outFile), tsContent)
  console.log(`${cfg.mode}: ${tools.length} tools (${tools.map((t) => t.function.name).join(', ')})`)
}
