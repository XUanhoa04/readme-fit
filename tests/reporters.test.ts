import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';
import { renderGitHub } from '../src/reporters/github.js';
import { renderSarif } from '../src/reporters/sarif.js';

describe('CI reporters', () => {
  it('emits SARIF 2.1.0 with rule metadata and source locations', async () => {
    const report = await analyzeRepository(path.resolve('fixtures', 'stale-cli'));
    const sarif = JSON.parse(renderSarif(report, 2)) as {
      version: string;
      runs: Array<{
        tool: { driver: { rules: unknown[] } };
        results: Array<{
          ruleId: string;
          locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
        }>;
      }>;
    };
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0]?.results).toHaveLength(2);
    expect(sarif.runs[0]?.tool.driver.rules.length).toBeGreaterThan(0);
    expect(sarif.runs[0]?.results[0]?.ruleId).toBeTruthy();
    expect(
      sarif.runs[0]?.results[0]?.locations[0]?.physicalLocation.artifactLocation.uri,
    ).toBeTruthy();
  });

  it('emits escaped GitHub workflow commands and a stable summary', async () => {
    const report = await analyzeRepository(path.resolve('fixtures', 'stale-cli'));
    const output = renderGitHub(report, 1);
    expect(output).toMatch(/^::(?:error|warning|notice) file=/);
    expect(output).toContain('title=P0');
    expect(output).toMatch(/readme-fit score=\d+\/100 coverage=\d+% findings=\d+/);
    expect(output.split('\n').filter((line) => line.startsWith('::'))).toHaveLength(1);
  });
});
