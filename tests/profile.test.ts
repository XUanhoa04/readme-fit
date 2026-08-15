import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { PublicProfileData } from '../src/models/index.js';
import {
  analyzeProfile,
  analyzeProfileData,
} from '../src/profile/analyzer/analyze-profile.js';
import type { ProfileProvider } from '../src/profile/provider.js';

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
});
