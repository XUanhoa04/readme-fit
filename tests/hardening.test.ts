import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkExternalLinks } from '../src/analyzers/links/external-rule.js';
import { analyzeRepository } from '../src/core/analysis.js';
import { MAX_INSPECTED_TEXT_BYTES } from '../src/core/repository/inspector.js';

function response(status: number): Response {
  return new Response(null, { status });
}

describe('untrusted repository hardening', () => {
  it('checks external links with HEAD fallback and explicit unverified states', async () => {
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/fallback') && init?.method === 'HEAD')
        return Promise.resolve(response(405));
      if (url.endsWith('/fallback')) return Promise.resolve(response(200));
      if (url.endsWith('/private')) return Promise.resolve(response(403));
      if (url.endsWith('/missing')) return Promise.resolve(response(404));
      if (url.endsWith('/error')) return Promise.reject(new Error('socket closed'));
      return Promise.resolve(response(204));
    }) as typeof fetch;

    const results = await checkExternalLinks(
      [
        'https://example.test/ok',
        'https://example.test/fallback',
        'https://example.test/private',
        'https://example.test/missing',
        'https://example.test/error',
        'https://example.test/ok',
      ],
      fetcher,
      2,
    );

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.test/ok', status: 'reachable' }),
        expect.objectContaining({
          url: 'https://example.test/fallback',
          status: 'reachable',
        }),
        expect.objectContaining({
          url: 'https://example.test/private',
          status: 'unverified',
        }),
        expect.objectContaining({
          url: 'https://example.test/missing',
          status: 'broken',
        }),
        expect.objectContaining({
          url: 'https://example.test/error',
          status: 'broken',
        }),
      ]),
    );
    expect(results).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('does not perform network checks in a default scan', async () => {
    const report = await analyzeRepository(path.resolve('fixtures', 'good-cli'));
    const result = report.scores.correctness?.rules.find(
      (rule) => rule.id === 'correctness.external-link.reachable',
    );
    expect(result?.status).toBe('not_applicable');
    expect(report.coverage.notChecked).toContain('external URL health');
  });

  it('rejects a relative link that escapes the repository root', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'readme-fit-traversal-'));
    const repository = path.join(temporary, 'repo');
    try {
      await mkdir(repository);
      await writeFile(
        path.join(repository, 'README.md'),
        '# Fixture\n\nUseful fixture.\n\n[Outside](../outside.md)\n',
      );
      const report = await analyzeRepository(repository);
      expect(
        report.findings.find((finding) => finding.id === 'correctness.link.exists')
          ?.observation,
      ).toMatch(/escapes repository root/i);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects a README larger than the static inspection limit', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'readme-fit-large-'));
    try {
      await writeFile(
        path.join(repository, 'README.md'),
        `# Too large\n${'x'.repeat(MAX_INSPECTED_TEXT_BYTES)}`,
      );
      await expect(analyzeRepository(repository)).rejects.toThrow(/inspection limit/i);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
