import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { PublicProfileData } from '../src/models/index.js';
import {
  analyzeProfile,
  analyzeProfileData,
} from '../src/profile/analyzer/analyze-profile.js';
import type { ProfileProvider } from '../src/profile/provider.js';
import { GitHubProfileProvider } from '../src/profile/github/github-provider.js';

async function fixture(): Promise<PublicProfileData> {
  return JSON.parse(
    await readFile('fixtures/profile/profile.json', 'utf8'),
  ) as PublicProfileData;
}

describe('profile analysis', () => {
  it('extracts repository themes and creates transparent category scores', async () => {
    const report = analyzeProfileData(await fixture());
    expect(report.total).toBeGreaterThan(60);
    expect(report.facts.visibleRepositoryThemes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ theme: 'developer-tools', repositories: 2 }),
      ]),
    );
    expect(Object.values(report.scores).every((score) => score.rules.length > 0)).toBe(
      true,
    );
    expect(report.disclaimer).toMatch(/does not measure/i);
  });

  it('uses a provider abstraction without network access', async () => {
    const data = await fixture();
    const provider: ProfileProvider = { getProfile: () => Promise.resolve(data) };
    expect((await analyzeProfile('fixture-user', provider)).user.login).toBe(
      'fixture-user',
    );
  });

  it('maps GitHub API rate-limit failures to an actionable error', async () => {
    const fetcher = (() =>
      Promise.resolve(new Response(null, { status: 403 }))) as typeof fetch;
    const provider = new GitHubProfileProvider(undefined, fetcher);
    await expect(provider.getProfile('limited')).rejects.toThrow(/GITHUB_TOKEN/i);
  });

  it('paginates public repositories beyond the first 100', async () => {
    const repositories = Array.from({ length: 101 }, (_, index) => ({
      name: `repo-${index}`,
      description: null,
      html_url: `https://github.test/repo-${index}`,
      language: 'TypeScript',
      topics: [],
      stargazers_count: 0,
      fork: false,
      archived: false,
      updated_at: '2026-08-15T00:00:00Z',
    }));
    const fetcher = ((input: string | URL | Request) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (/\/users\/pager$/.test(url)) {
        return Promise.resolve(
          Response.json({
            login: 'pager',
            name: null,
            bio: null,
            html_url: 'https://github.test/pager',
            blog: null,
            company: null,
            location: null,
            public_repos: 101,
            followers: 0,
          }),
        );
      }
      if (url.includes('/repos/pager/pager/readme'))
        return Promise.resolve(new Response(null, { status: 404 }));
      const page = Number(new URL(url).searchParams.get('page'));
      return Promise.resolve(
        Response.json(page === 1 ? repositories.slice(0, 100) : repositories.slice(100)),
      );
    }) as typeof fetch;
    const provider = new GitHubProfileProvider(undefined, fetcher);
    expect((await provider.getProfile('pager')).repositories).toHaveLength(101);
  });
});
