import { Octokit } from '@octokit/rest'
import type { GitHubRepo, GitHubPR, CreatePROptions } from '../../shared/types'

class GitHubService {
  private octokit: Octokit | null = null
  private _username: string | null = null

  get isAuthenticated(): boolean { return this.octokit !== null }
  get username(): string | null { return this._username }

  async authenticate(pat: string): Promise<string> {
    const client = new Octokit({ auth: pat })
    const { data } = await client.rest.users.getAuthenticated()
    this.octokit = client
    this._username = data.login
    return data.login
  }

  logout(): void {
    this.octokit = null
    this._username = null
  }

  async getRepos(): Promise<GitHubRepo[]> {
    if (!this.octokit) throw new Error('Не авторизован')
    const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100
    })
    return data.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      cloneUrl: r.clone_url ?? '',
      private: r.private,
      description: r.description ?? '',
      defaultBranch: r.default_branch ?? 'main'
    }))
  }

  async getPRs(owner: string, repo: string): Promise<GitHubPR[]> {
    if (!this.octokit) throw new Error('Не авторизован')
    const { data } = await this.octokit.rest.pulls.list({
      owner, repo, state: 'open', per_page: 50
    })
    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state as 'open' | 'closed' | 'merged',
      url: pr.html_url,
      author: pr.user?.login ?? '',
      createdAt: pr.created_at
    }))
  }

  async createPR(opts: CreatePROptions): Promise<GitHubPR> {
    if (!this.octokit) throw new Error('Не авторизован')
    const [owner, repo] = opts.repoFullName.split('/')
    const { data } = await this.octokit.rest.pulls.create({
      owner, repo,
      title: opts.title,
      body: opts.body ?? '',
      head: opts.head,
      base: opts.base
    })
    return {
      number: data.number,
      title: data.title,
      state: data.state as 'open' | 'closed' | 'merged',
      url: data.html_url,
      author: data.user?.login ?? '',
      createdAt: data.created_at
    }
  }
}

export const gitHubService = new GitHubService()
