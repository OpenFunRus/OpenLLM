import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import type { AgentToolContext } from '../AgentToolContext'
import { resolveAgentPath, resolveAgentPathOrError } from '../AgentToolContext'

const TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])
const MAX_DIAGNOSTICS = 100

type TsModule = typeof import('typescript')

function loadTypescript(workspaceRoot: string | null): TsModule {
  const candidates = [workspaceRoot, process.cwd(), path.join(__dirname, '..', '..', '..')].filter(
    (p): p is string => Boolean(p)
  )
  for (const base of candidates) {
    try {
      return require(require.resolve('typescript', { paths: [base] })) as TsModule
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'TypeScript not available — open a workspace with typescript installed, or run from dev environment'
  )
}

function findTsConfig(ts: TsModule, workspaceRoot: string): string | undefined {
  return ts.findConfigFile(workspaceRoot, ts.sys.fileExists, 'tsconfig.json')
}

function normalizeForCompare(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, '/').toLowerCase()
}

async function collectTargetFiles(
  ctx: AgentToolContext,
  ts: TsModule,
  rawPaths: unknown
): Promise<string[]> {
  if (!ctx.workspaceRoot) {
    throw new Error('No workspace folder open')
  }

  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    const configPath = findTsConfig(ts, ctx.workspaceRoot)
    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
      if (configFile.error) {
        throw new Error(ts.formatDiagnostic(configFile.error, formatHost(ts)))
      }
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
      )
      return parsed.fileNames.filter((f) => TS_EXTS.has(path.extname(f).toLowerCase()))
    }

    const matches = await fg(['**/*.{ts,tsx,js,jsx,mts,cts}'], {
      cwd: ctx.workspaceRoot,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/release/**'],
    })
    return matches
  }

  const files = new Set<string>()
  for (const raw of rawPaths) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const resolved = resolveAgentPath(ctx, raw)
    if (!resolved) continue

    let stat: fs.Stats
    try {
      stat = fs.statSync(resolved)
    } catch {
      continue
    }

    if (stat.isFile()) {
      if (TS_EXTS.has(path.extname(resolved).toLowerCase())) {
        files.add(path.normalize(resolved))
      }
      continue
    }

    if (stat.isDirectory()) {
      const matches = await fg(['**/*.{ts,tsx,js,jsx,mts,cts}'], {
        cwd: resolved,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/release/**'],
      })
      for (const match of matches) files.add(path.normalize(match))
    }
  }

  return [...files]
}

function formatHost(tsModule: TsModule): import('typescript').FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }
}

function formatDiagnostic(
  tsModule: TsModule,
  diag: import('typescript').Diagnostic,
  workspaceRoot: string | null
): string {
  if (!diag.file || diag.start === undefined) {
    return tsModule.flattenDiagnosticMessageText(diag.messageText, '\n')
  }

  const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start)
  const rel = workspaceRoot
    ? path.relative(workspaceRoot, diag.file.fileName).replace(/\\/g, '/')
    : diag.file.fileName
  const severity =
    diag.category === tsModule.DiagnosticCategory.Error
      ? 'error'
      : diag.category === tsModule.DiagnosticCategory.Warning
        ? 'warning'
        : 'info'
  const code = diag.code ? ` TS${diag.code}` : ''
  const message = tsModule.flattenDiagnosticMessageText(diag.messageText, '\n')
  return `${rel}:${line + 1}:${character + 1} - ${severity}${code}: ${message}`
}

function filterDiagnostics(
  tsModule: TsModule,
  diagnostics: readonly import('typescript').Diagnostic[],
  scopePaths: string[] | null,
  workspaceRoot: string | null
): import('typescript').Diagnostic[] {
  if (!scopePaths || scopePaths.length === 0) return [...diagnostics]

  const normalizedScopes = scopePaths.map((p) => normalizeForCompare(p))
  return diagnostics.filter((diag) => {
    const file = diag.file?.fileName
    if (!file) return false
    const normFile = normalizeForCompare(file)
    return normalizedScopes.some((scope) => normFile === scope || normFile.startsWith(`${scope}/`))
  })
}

export async function executeReadLints(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const ts = loadTypescript(ctx.workspaceRoot)
  const rawPaths = args.paths

  let scopePaths: string[] | null = null
  if (Array.isArray(rawPaths) && rawPaths.length > 0) {
    scopePaths = []
    for (const raw of rawPaths) {
      if (typeof raw !== 'string' || !raw.trim()) continue
      try {
        scopePaths.push(resolveAgentPathOrError(ctx, raw))
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  let targetFiles: string[]
  try {
    targetFiles = await collectTargetFiles(ctx, ts, rawPaths)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }

  if (targetFiles.length === 0) {
    return 'No TypeScript/JavaScript files found for lint diagnostics.'
  }

  const workspaceRoot = ctx.workspaceRoot!
  const configPath = findTsConfig(ts, workspaceRoot)
  let program: import('typescript').Program

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
    if (configFile.error) {
      return `Error reading tsconfig: ${ts.formatDiagnostic(configFile.error, formatHost(ts))}`
    }
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    )
    program = ts.createProgram(parsed.fileNames, parsed.options)
  } else {
    const options: import('typescript').CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
    }
    program = ts.createProgram(targetFiles, options)
  }

  const allDiagnostics = ts.getPreEmitDiagnostics(program)
  const filtered = filterDiagnostics(ts, allDiagnostics, scopePaths, workspaceRoot)
  const relevant = filtered.filter((d) => d.category <= ts.DiagnosticCategory.Warning)

  if (relevant.length === 0) {
    return 'No linter errors found.'
  }

  const lines = relevant
    .slice(0, MAX_DIAGNOSTICS)
    .map((d) => formatDiagnostic(ts, d, workspaceRoot))

  const suffix =
    relevant.length > MAX_DIAGNOSTICS
      ? `\n\n… and ${relevant.length - MAX_DIAGNOSTICS} more diagnostic(s) (truncated)`
      : ''

  return `${lines.join('\n')}${suffix}`
}
