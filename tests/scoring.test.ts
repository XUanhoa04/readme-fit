import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';

async function withRepository(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'readme-fit-scoring-'));
  try {
    await Promise.all(
      Object.entries(files).map(([name, contents]) =>
        writeFile(path.join(root, name), contents),
      ),
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('coverage-aware scoring and calibrated rubrics', () => {
  it('exposes category weights and uses them for the overall score', async () => {
    const report = await analyzeRepository(path.resolve('fixtures', 'stale-cli'));
    const covered = Object.values(report.scores).filter(
      (score) => score && score.score !== null && score.weight > 0,
    );
    const weight = covered.reduce((sum, score) => sum + (score?.weight ?? 0), 0);
    const expected = Math.round(
      covered.reduce((sum, score) => sum + (score?.score ?? 0) * (score?.weight ?? 0), 0) /
        weight,
    );
    expect(report.overall).toBe(expected);
    expect(report.overallCoverage).toBe(100);
    expect(covered.every((score) => score?.coverage === 100)).toBe(true);
  });

  it('distinguishes partial outcomes and emits an actionable finding for them', async () => {
    await withRepository(
      {
        'README.md':
          '# Tool\n\nA small utility built for developers.\n\n## Quick Start\n\n```bash\nnpx tool scan\n```\n',
        'package.json': JSON.stringify({ name: 'tool', bin: { tool: 'cli.js' } }),
      },
      async (root) => {
        const report = await analyzeRepository(root);
        const why = report.scores.impression?.rules.find(
          (rule) => rule.id === 'impression.why',
        );
        expect(why?.status).toBe('partial');
        expect(report.findings.some((finding) => finding.id === 'impression.why')).toBe(
          true,
        );
      },
    );
  });

  it('does not treat a generic image or ordinary code sample as product proof', async () => {
    await withRepository(
      {
        'README.md':
          '# Dashboard\n\nA dashboard for teams.\n\n![Team photo](team.png)\n\n```js\nconsole.log("hello")\n```\n',
        'package.json': JSON.stringify({ dependencies: { react: '^19.0.0' } }),
        'team.png': '',
      },
      async (root) => {
        const report = await analyzeRepository(root);
        expect(report.facts.demos).toEqual([]);
        expect(
          report.scores['visual-proof']?.rules.find(
            (rule) => rule.id === 'visual.demo.present',
          )?.status,
        ).toBe('fail');
        expect(
          report.scores.impression?.rules.find((rule) => rule.id === 'impression.proof')
            ?.status,
        ).toBe('fail');
      },
    );
  });

  it.each([
    {
      type: 'web-app',
      manifest: { scripts: { dev: 'vite' }, dependencies: { react: '^19.0.0' } },
      extra: {},
      readme:
        '# Web app\n\nA web app for teams.\n\n## Quick Start\n\n```bash\nnpm run dev\n```\n',
    },
    {
      type: 'api',
      manifest: {
        scripts: { start: 'node server.js' },
        dependencies: { express: '^5.0.0' },
      },
      extra: {},
      readme:
        '# API\n\nAn API for teams.\n\n## Quick Start\n\n```bash\nnpm start\n```\n\n## Request example\n\n```bash\ncurl http://localhost:3000/health\n```\n',
    },
    {
      type: 'github-action',
      manifest: undefined,
      extra: { 'action.yml': 'name: Example\nruns:\n  using: node20\n  main: index.js\n' },
      readme:
        '# Example Action\n\nAn action for maintainers.\n\n## Usage\n\n```yaml\n- uses: owner/example-action@v1\n```\n',
    },
    {
      type: 'sdk',
      manifest: { name: 'example-sdk', main: 'index.js' },
      extra: { '.readme-fit.yml': 'project:\n  type: sdk\n' },
      readme:
        '# Example SDK\n\nAn SDK for developers.\n\n## Installation\n\n```bash\nnpm install example-sdk\n```\n\n## Usage\n\n```js\nimport sdk from "example-sdk";\nsdk.run();\n```\n',
    },
  ])(
    'applies a stable $type completeness rubric',
    async ({ type, manifest, extra, readme }) => {
      await withRepository(
        {
          'README.md': readme,
          ...(manifest ? { 'package.json': JSON.stringify(manifest) } : {}),
          ...extra,
        },
        async (root) => {
          const report = await analyzeRepository(root);
          expect(report.project.primaryType).toBe(type);
          expect(report.project.rubricStatus).toBe('stable');
          expect(report.scores.completeness?.score).toBe(100);
        },
      );
    },
  );

  it('labels recognized but uncalibrated rubrics as experimental', async () => {
    await withRepository(
      {
        'README.md': '# Agent\n\nAn agent for developers.\n',
        'package.json': JSON.stringify({ dependencies: { langchain: '^1.0.0' } }),
      },
      async (root) => {
        const report = await analyzeRepository(root);
        expect(report.project.primaryType).toBe('ai-agent');
        expect(report.project.rubricStatus).toBe('experimental');
        expect(report.scores.completeness).toBeUndefined();
        expect(report.limitations.join(' ')).toMatch(/experimental/);
      },
    );
  });
});
