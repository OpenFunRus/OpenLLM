import fs from 'fs/promises'
import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import type { FileNode } from '../../shared/types'
import { stripUtf8Bom } from '../../shared/sanitizeFileContent'

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'bin', 'obj', '.vs', '.idea',
  '__pycache__', '.venv', 'venv', 'dist', 'build',
  '.next', '.nuxt', 'coverage', 'out', '.cache'
])

class FileService {
  private watchers = new Map<string, FSWatcher>()

  async getFileTree(dirPath: string): Promise<FileNode[]> {
    return this._buildTree(dirPath)
  }

  private async _buildTree(dirPath: string): Promise<FileNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const nodes: FileNode[] = []

    const dirs: FileNode[] = []
    const files: FileNode[] = []

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const children = await this._buildTree(fullPath)
        dirs.push({ name: entry.name, path: fullPath, isDirectory: true, children })
      } else {
        files.push({ name: entry.name, path: fullPath, isDirectory: false })
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))
    nodes.push(...dirs, ...files)
    return nodes
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, stripUtf8Bom(content), 'utf-8')
  }

  async createFile(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, '', 'utf-8')
  }

  async createDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  async delete(targetPath: string): Promise<void> {
    await fs.rm(targetPath, { recursive: true, force: true })
  }

  async removeIfEmpty(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath)
      if (!stat.isDirectory()) return false
      const entries = await fs.readdir(dirPath)
      if (entries.length > 0) return false
      await fs.rmdir(dirPath)
      return true
    } catch {
      return false
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath)
  }

  watchDirectory(
    dirPath: string,
    onChange: (eventType: string, filePath: string) => void
  ): () => void {
    const existing = this.watchers.get(dirPath)
    if (existing) { existing.close(); this.watchers.delete(dirPath) }

    const watcher = chokidar.watch(dirPath, {
      ignored: (p: string) => IGNORED_DIRS.has(path.basename(p)),
      persistent: true,
      ignoreInitial: true,
      depth: 10
    })

    watcher.on('add', (p) => onChange('created', p))
    watcher.on('unlink', (p) => onChange('deleted', p))
    watcher.on('change', (p) => onChange('changed', p))
    watcher.on('addDir', (p) => onChange('created', p))
    watcher.on('unlinkDir', (p) => onChange('deleted', p))

    this.watchers.set(dirPath, watcher)
    return () => { watcher.close(); this.watchers.delete(dirPath) }
  }

  stopWatch(dirPath: string): void {
    this.watchers.get(dirPath)?.close()
    this.watchers.delete(dirPath)
  }
}

export const fileService = new FileService()
