import type { PublicProfileData, PublicRepository } from '../../models/index.js';
import type { ProfileProvider } from '../provider.js';
import { VERSION } from '../../version.js';

interface GitHubUserResponse {
  login: string;
  name: string | null;
  bio: string | null;
  html_url: string;
  blog: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
}

interface GitHubRepoResponse {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  updated_at: string;
}

interface GitHubReadmeResponse {
  content?: string;
  encoding?: string;
}

const MAX_PROFILE_README_BYTES = 1_048_576;
const MAX_REPOSITORY_PAGES = 10;

export class GitHubProfileProvider implements ProfileProvider {
  constructor(
    private readonly token = process.env.GITHUB_TOKEN,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request<T>(
    url: string,
    accept = 'application/vnd.github+json',
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': `readme-fit/${VERSION}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await this.fetcher(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      if (response.status === 404)
        throw new Error('GitHub user or profile README not found.');
      if (response.status === 403)
        throw new Error('GitHub API rate limit reached. Set GITHUB_TOKEN and retry.');
      throw new Error(`GitHub API request failed (${response.status}).`);
    }
    return (await response.json()) as T;
  }

  private async profileReadme(username: string): Promise<string | null> {
    try {
      const response = await this.request<GitHubReadmeResponse>(
        `https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(username)}/readme`,
      );
      if (response.encoding !== 'base64' || !response.content) return null;
      const encoded = response.content.replaceAll('\n', '');
      if (encoded.length > Math.ceil((MAX_PROFILE_README_BYTES * 4) / 3) + 4) {
        throw new Error('GitHub Profile README exceeds the 1 MiB inspection limit.');
      }
      const decoded = Buffer.from(encoded, 'base64');
      if (decoded.byteLength > MAX_PROFILE_README_BYTES) {
        throw new Error('GitHub Profile README exceeds the 1 MiB inspection limit.');
      }
      return decoded.toString('utf8');
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) return null;
      throw error;
    }
  }

  private async repositories(username: string): Promise<GitHubRepoResponse[]> {
    const repositories: GitHubRepoResponse[] = [];
    for (let page = 1; page <= MAX_REPOSITORY_PAGES; page += 1) {
      const batch = await this.request<GitHubRepoResponse[]>(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&page=${page}`,
      );
      repositories.push(...batch);
      if (batch.length < 100) break;
    }
    return repositories;
  }

  async getProfile(username: string): Promise<PublicProfileData> {
    const encoded = encodeURIComponent(username);
    const [user, repositories, profileReadme] = await Promise.all([
      this.request<GitHubUserResponse>(`https://api.github.com/users/${encoded}`),
      this.repositories(username),
      this.profileReadme(username),
    ]);
    const mapped: PublicRepository[] = repositories.map((repository) => ({
      name: repository.name,
      description: repository.description,
      url: repository.html_url,
      language: repository.language,
      topics: repository.topics ?? [],
      stars: repository.stargazers_count,
      fork: repository.fork,
      archived: repository.archived,
      updatedAt: repository.updated_at,
    }));
    return {
      login: user.login,
      name: user.name,
      bio: user.bio,
      url: user.html_url,
      blog: user.blog,
      company: user.company,
      location: user.location,
      publicRepos: user.public_repos,
      followers: user.followers,
      profileReadme,
      repositories: mapped,
    };
  }
}
