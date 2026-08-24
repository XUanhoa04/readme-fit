import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';
import {
  compareBaseline,
  createBaseline,
  findingFingerprint,
  findingSubject,
  parseBaseline,
} from '../src/core/baseline.js';

const fixture = (name: string) => path.resolve('fixtures', name);

describe('baseline regression analysis', () => {
  it('uses a stable fingerprint that is insensitive to line movement', async () => {
    const report = await analyzeRepository(fixture('stale-cli'));
    const original = report.findings[0];
    expect(original).toBeDefined();
    if (!original) return;
    const moved = {
      ...original,
      source: { ...original.source, line: (original.source?.line ?? 1) + 20 },
    };
    expect(findingFingerprint(moved)).toBe(findingFingerprint(original));
  });

  it('round-trips the explicit baseline schema', async () => {
    const baseline = createBaseline(await analyzeRepository(fixture('good-cli')));
    expect(parseBaseline(JSON.stringify(baseline))).toEqual(baseline);
    expect(baseline.schemaVersion).toBe(2);
    expect(baseline.fingerprintVersion).toBe(2);
  });

  it('rejects malformed and unsupported baseline documents', () => {
    expect(() => parseBaseline('{broken')).toThrow(/valid JSON/i);
    expect(() => parseBaseline('{"schemaVersion":2}')).toThrow(/unsupported/i);
  });

  it('distinguishes separate evidence subjects while ignoring line movement', async () => {
    const report = await analyzeRepository(fixture('stale-cli'));
    const original = report.findings.find(
      (finding) => finding.id === 'correctness.link.exists',
    );
    expect(original).toBeDefined();
    if (!original) return;
    const other = {
      ...original,
      evidence: original.evidence.map((item, index) =>
        index === 0 ? { ...item, message: 'docs/a-different-target.md' } : item,
      ),
    };
    expect(findingSubject(other)).not.toBe(findingSubject(original));
    expect(findingFingerprint(other)).not.toBe(findingFingerprint(original));
  });

  it('reads legacy schema version 1 baselines for compatibility', () => {
    const migrated = parseBaseline(
      JSON.stringify({
        schemaVersion: 1,
        createdAt: '2026-08-15T00:00:00.000Z',
        projectType: 'cli',
        scores: { correctness: 50 },
        findings: [
          {
            fingerprint: '0123456789abcdef',
            id: 'correctness.link.exists',
            title: 'Broken relative link',
            category: 'correctness',
            severity: 'high',
            path: 'README.md',
          },
        ],
      }),
    );
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.fingerprintVersion).toBe(1);
  });

  it('separates new, resolved, and unchanged findings', async () => {
    const good = await analyzeRepository(fixture('good-cli'));
    const stale = await analyzeRepository(fixture('stale-cli'));
    const regression = compareBaseline(stale, createBaseline(good));
    const improvement = compareBaseline(good, createBaseline(stale));
    expect(regression.newFindings.length).toBeGreaterThan(5);
    expect(improvement.resolvedFindings.length).toBeGreaterThan(5);
    expect(regression.scoreDeltas.correctness).toBeLessThan(0);
  });
});
