import fs from 'fs'
import path from 'path'

function logPath(): string {
  try {
    const { app } = require('electron') as { app?: { getPath: (name: string) => string } }
    if (app) {
      return path.join(path.dirname(app.getPath('exe')), 'openllm_debug.log')
    }
  } catch {
    /* outside electron */
  }
  return path.join(process.cwd(), 'openllm_debug.log')
}

/** Always-on agent diagnostics next to OpenLLM.exe (see openllm_debug.log). */
export function agentRunLog(message: string): void {
  const line = `[${new Date().toISOString()}] [agent] ${message}\n`
  try {
    fs.appendFileSync(logPath(), line)
  } catch {
    try {
      fs.appendFileSync('C:/Users/Public/openllm_debug.log', line)
    } catch {
      /* ignore */
    }
  }
}
