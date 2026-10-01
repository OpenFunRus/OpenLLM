import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const MODES = [
  { intercept: 'cursor_agent.txt', json: 'agent-tools.json' },
  { intercept: 'cursor_plan.txt', json: 'plan-tools.json' },
  { intercept: 'cursor_ask.txt', json: 'ask-tools.json' },
]

function extractFromIntercept(interceptFile) {
  const text = fs.readFileSync(path.join(root, 'docs/cursor', interceptFile), 'utf8')
  const match = text.match(/<tools>([\s\S]*?)<\/tools>/)
  if (!match) throw new Error(`No <tools> in ${interceptFile}`)
  return match[1]
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

let failed = false

for (const { intercept, json } of MODES) {
  const interceptTools = extractFromIntercept(intercept)
  const registryTools = JSON.parse(fs.readFileSync(path.join(root, 'docs/cursor/tools', json), 'utf8'))

  if (interceptTools.length !== registryTools.length) {
    console.error(`${json}: count mismatch intercept=${interceptTools.length} registry=${registryTools.length}`)
    failed = true
  }

  for (let i = 0; i < interceptTools.length; i++) {
    const a = interceptTools[i]
    const b = registryTools[i]
    if (a.function.name !== b?.function?.name) {
      console.error(`${json}: order/name mismatch at ${i}: ${a.function.name} vs ${b?.function?.name}`)
      failed = true
      continue
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.error(`${json}: schema mismatch for ${a.function.name}`)
      failed = true
    }
  }
  console.log(`${json}: OK (${registryTools.length} tools)`)
}

const agentTools = JSON.parse(fs.readFileSync(path.join(root, 'docs/cursor/tools/agent-tools.json'), 'utf8'))
for (const name of ['Read', 'Write', 'StrReplace', 'Delete', 'Glob', 'Grep', 'Shell']) {
  if (!agentTools.some((t) => t.function.name === name)) {
    console.error(`Missing P0 tool in agent: ${name}`)
    failed = true
  }
}

if (failed) {
  console.error('validate:agent-tools FAILED')
  process.exit(1)
}

console.log('validate:agent-tools OK')
