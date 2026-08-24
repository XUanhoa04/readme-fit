import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseReadmeCommands } from '../src/core/claims/commands.js';
import { resolveReadme, type ReadmeFitConfig } from '../src/core/config/config.js';
import { parseReadme } from '../src/core/markdown/parser.js';
import { findingFingerprint } from '../src/core/baseline.js';
import type { Finding } from '../src/models/index.js';
import { normalizeRuleScore } from '../src/rules/helpers.js';

const config: ReadmeFitConfig = {
  version: 2,
  project: { type: 'auto' },
  readme: { path: 'README.md' },
  rules: {},
  ruleOverrides: {},
  ignore: { rules: [], paths: [] },
  scoring: { preset: 'balanced' },
};

describe('property-based invariants', () => {
  it('parses arbitrary Markdown and shell-like blocks deterministically', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (value) => {
        const markdown = `# Fuzz\n\n\`\`\`bash\n${value}\n\`\`\`\n`;
        const first = parseReadme(markdown, 'README.md');
        const second = parseReadme(markdown, 'README.md');
        expect(first.raw).toBe(markdown);
        expect(parseReadmeCommands(first)).toEqual(parseReadmeCommands(second));
      }),
      { numRuns: 250 },
    );
  });

  it('clamps every finite rule score to its declared weight', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: -10_000, max: 20_000 }),
        (weight, earned) => {
          const score = normalizeRuleScore({
            id: 'property.score.bound',
            status: 'partial',
            weight,
            earned,
            explanation: 'generated',
          });
          expect(score.earned).toBeGreaterThanOrEqual(0);
          expect(score.earned).toBeLessThanOrEqual(weight);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('keeps safe README paths inside root and rejects traversal', () => {
    const root = path.resolve('property-root');
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('docs', 'guide', 'nested'), {
          minLength: 0,
          maxLength: 5,
        }),
        (segments) => {
          const safe = { ...config, readme: { path: path.join(...segments, 'README.md') } };
          const resolved = resolveReadme(root, safe);
          expect(path.relative(root, resolved)).not.toMatch(/^\.\.(?:[\\/]|$)/);
        },
      ),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (depth) => {
        const escaped = {
          ...config,
          readme: {
            path: path.join(...Array.from({ length: depth }, () => '..'), 'README.md'),
          },
        };
        expect(() => resolveReadme(root, escaped)).toThrow(/inside the repository/);
      }),
    );
  });

  it('keeps finding fingerprints stable when only source lines move', () => {
    const base: Finding = {
      id: 'property.finding.stable',
      category: 'correctness',
      severity: 'high',
      priority: 'P1',
      confidence: 'high',
      title: 'Stable subject',
      source: { path: 'README.md', line: 1 },
      observation: 'Generated',
      evidence: [{ type: 'claim', message: 'npm run test', value: 'npm run test' }],
      deterministic: true,
    };
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (line) => {
        expect(findingFingerprint({ ...base, source: { ...base.source, line } })).toBe(
          findingFingerprint(base),
        );
      }),
    );
  });
});
