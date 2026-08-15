import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';
import {
  compareBaseline,
  createBaseline,
  findingFingerprint,
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
    expect(baseline.schemaVersion).toBe(1);
  });

  it('rejects malformed and unsupported baseline documents', () => {
    expect(() => parseBaseline('{broken')).toThrow(/valid JSON/i);
    expect(() => parseBaseline('{"schemaVersion":2}')).toThrow(/unsupported/i);
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
