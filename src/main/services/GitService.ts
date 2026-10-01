import simpleGit, { SimpleGit } from 'simple-git'
import type { GitRepoInfo, GitFileStatus, GitFileState } from '../../shared/types'

class GitService {
  private git(cwd: string): SimpleGit {
    return simpleGit({ baseDir: cwd, binary: 'git', maxConcurrentProcesses: 1 })
  }

  async isRepository(cwd: string): Promise<boolean> {
    try { return await this.git(cwd).checkIsRepo() }
    catch { return false }
  }

  async getInfo(cwd: string): Promise<GitRepoInfo> {
    const g = this.git(cwd)
    const isRepo = await this.isRepository(cwd)
    if (!isRepo) return { workingDir: cwd, branch: '', isRepo: false }
    const branch = await g.revparse(['--abbrev-ref', 'HEAD']).catch(() => '(detached)')
    return { workingDir: cwd, branch: branch.trim(), isRepo: true }
  }

  async getStatus(cwd: string): Promise<GitFileStatus[]> {
    const status = await this.git(cwd).status()
    const results: GitFileStatus[] = []

    const map = (code: string): GitFileState => {
      if (code === '?') return 'untracked'
      if (code === 'M') return 'modified'
      if (code === 'A') return 'added'
      if (code === 'D') return 'deleted'
      if (code === 'R') return 'renamed'
      if (code === 'U') return 'conflicted'
      return 'modified'
    }

    for (const f of status.files) {
      const indexCode = f.index.trim()
      const workCode = f.working_dir.trim()

      if (indexCode && indexCode !== '?') {
        results.push({ path: f.path, state: map(indexCode), isStaged: true })
      }
      if (workCode && workCode !== ' ') {
        results.push({ path: f.path, state: map(workCode === '?' ? '?' : workCode), isStaged: false })
      }
    }

    return results
  }

  async stage(cwd: string, filePath: string): Promise<void> {
    await this.git(cwd).add(filePath)
  }

  async stageAll(cwd: string): Promise<void> {
    await this.git(cwd).add('.')
  }

  async unstage(cwd: string, filePath: string): Promise<void> {
    await this.git(cwd).reset(['HEAD', '--', filePath])
  }

  async commit(cwd: string, message: string, name: string, email: string): Promise<string> {
    const g = this.git(cwd)
    await g.addConfig('user.name', name)
    await g.addConfig('user.email', email)
    const result = await g.commit(message)
    return result.commit
  }

  async push(cwd: string, pat?: string): Promise<void> {
    const g = this.git(cwd)
    if (pat) {
      const remote = await g.remote(['get-url', 'origin']).catch(() => '')
      const authed = remote?.trim().replace('https://', `https://${pat}:@`) ?? ''
      await g.push(['--set-upstream', authed || 'origin', 'HEAD'])
    } else {
      await g.push()
    }
  }

  async pull(cwd: string, pat?: string): Promise<void> {
    await this.git(cwd).pull()
  }

  async getBranches(cwd: string): Promise<string[]> {
    const result = await this.git(cwd).branchLocal()
    return result.all
  }

  async checkoutBranch(cwd: string, branch: string, create = false): Promise<void> {
    if (create) await this.git(cwd).checkoutLocalBranch(branch)
    else await this.git(cwd).checkout(branch)
  }

  async init(cwd: string): Promise<void> {
    await this.git(cwd).init()
  }

  async getFileDiff(cwd: string, filePath: string): Promise<string> {
    return this.git(cwd).diff([filePath])
  }
}

export const gitService = new GitService()
