import simpleGit, { SimpleGit } from 'simple-git'

export interface GitRepoInfo {
  workingDir: string
  branch: string
  isRepo: boolean
}

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
}

export const gitService = new GitService()
