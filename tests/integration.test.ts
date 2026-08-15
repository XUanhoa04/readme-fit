import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';

const fixture = (name: string) => path.resolve('fixtures', name);

describe('repository analysis', () => {
  it('detects drift, onboarding, impression, and visual placement in stale CLI', async () => {
    const report = await analyzeRepository(fixture('stale-cli'));
    const ids = report.findings.map((finding) => finding.id);
    expect(ids).toContain('correctness.command.exists');
    expect(ids).toContain('correctness.link.exists');
    expect(ids).toContain('correctness.package-name.matches');
    expect(ids).toContain('correctness.runtime.matches');
    expect(ids).toContain('correctness.license.matches');
    expect(ids).toContain('onboarding.quick-start.present');
    expect(ids).toContain('onboarding.expected-output.present');
    expect(ids).toContain('visual.demo.placement');
    expect(ids).toContain('trust.badges.signal-to-noise');
  });

  it('produces substantially fewer findings for a good CLI', async () => {
    const stale = await analyzeRepository(fixture('stale-cli'));
    const good = await analyzeRepository(fixture('good-cli'));
    expect(good.findings.length).toBeLessThan(stale.findings.length / 2);
    expect(
      good.findings.some((finding) => finding.id === 'correctness.command.exists'),
    ).toBe(false);
    expect(good.scores.completeness?.score).toBe(100);
  });

  it('does not penalize a small library for missing video or logo', async () => {
    const report = await analyzeRepository(fixture('library'));
    expect(
      report.scores['visual-proof']?.rules.find((rule) => rule.id === 'visual.demo.present')
        ?.status,
    ).toBe('not_applicable');
    expect(report.findings.some((finding) => /logo|video/i.test(finding.title))).toBe(
      false,
    );
  });

  it('does not let empty headings and a logo game completeness or visual proof', async () => {
    const report = await analyzeRepository(fixture('adversarial-cli'));
    expect(report.scores.completeness?.score).toBe(0);
    expect(report.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        'onboarding.quick-start.present',
        'completeness.installation.present',
        'completeness.quick-start.present',
        'visual.demo.present',
      ]),
    );
    expect(report.facts.demos).toEqual([]);
  });

  it('keeps the stable JSON schema explicit', async () => {
    const report = await analyzeRepository(fixture('good-cli'));
    expect({
      schemaVersion: report.schemaVersion,
      projectType: report.project.primaryType,
      scoreCategories: Object.keys(report.scores).sort(),
      findingShape: Object.keys(report.findings[0] ?? {}).sort(),
      coverageKeys: Object.keys(report.coverage).sort(),
    }).toMatchInlineSnapshot(`
      {
        "coverageKeys": [
          "inferred",
          "notChecked",
          "verified",
        ],
        "findingShape": [
          "category",
          "confidence",
          "deterministic",
          "evidence",
          "id",
          "impact",
          "observation",
          "priority",
          "recommendation",
          "severity",
          "title",
        ],
        "projectType": "cli",
        "schemaVersion": 1,
        "scoreCategories": [
          "clarity",
          "completeness",
          "correctness",
          "impression",
          "onboarding",
          "trust",
          "visual-proof",
        ],
      }
    `);
  });
});
