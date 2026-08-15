import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';

async function temporaryRepository(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'readme-fit-edge-'));
  try {
    await Promise.all(
      Object.entries(files).map(([file, value]) => writeFile(path.join(root, file), value)),
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('analysis edge cases and scoring math', () => {
  it('returns a clear error when the README is missing', async () => {
    await temporaryRepository({}, async (root) => {
      await expect(analyzeRepository(root)).rejects.toThrow(/README not found/i);
    });
  });

  it('audits an empty README without crashing or granting a passing score', async () => {
    await temporaryRepository({ 'README.md': '' }, async (root) => {
      const report = await analyzeRepository(root);
      expect(report.readme.words).toBe(0);
      expect(report.findings.map((finding) => finding.id)).toEqual(
        expect.arrayContaining(['structure.h1', 'hero.explanation.present']),
      );
      expect(report.overall).toBeLessThan(50);
    });
  });

  it('surfaces malformed package metadata instead of silently skipping it', async () => {
    await temporaryRepository(
      { 'README.md': '# Broken metadata\n\nA useful package.\n', 'package.json': '{bad' },
      async (root) => {
        const report = await analyzeRepository(root);
        expect(
          report.findings.find((finding) => finding.id === 'correctness.metadata.parseable')
            ?.source?.path,
        ).toBe('package.json');
      },
    );
  });

  it('derives every category and overall score from visible rule results', async () => {
    const report = await analyzeRepository(path.resolve('fixtures', 'stale-cli'));
    for (const category of Object.values(report.scores)) {
      if (!category) continue;
      const applicable = category.rules.filter((rule) => rule.status !== 'not_applicable');
      const weight = applicable.reduce((sum, rule) => sum + rule.weight, 0);
      const expected = weight
        ? Math.round(
            (applicable.reduce((sum, rule) => sum + rule.earned, 0) / weight) * 100,
          )
        : null;
      expect(category.score).toBe(expected);
    }
    const numeric = Object.values(report.scores).flatMap((score) => score?.score ?? []);
    expect(report.overall).toBe(
      Math.round(numeric.reduce((sum, score) => sum + score, 0) / numeric.length),
    );
  });
});
