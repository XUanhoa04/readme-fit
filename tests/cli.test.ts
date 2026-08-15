import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function runCli(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('CLI behavior', () => {
  it('renders a focused impression report distinct from scan', () => {
    const scan = runCli(['scan', 'fixtures/stale-cli']);
    const impression = runCli(['impression', 'fixtures/stale-cli']);
    expect(scan.status).toBe(0);
    expect(impression.status).toBe(0);
    expect(impression.stdout).toContain('readme-fit · FIRST 5 SECONDS');
    expect(impression.stdout).not.toContain('README FIT');
    expect(scan.stdout).not.toBe(impression.stdout);
  });

  it('makes scan --impression use the same focused contract', () => {
    const flag = runCli(['scan', 'fixtures/stale-cli', '--impression']);
    const command = runCli(['impression', 'fixtures/stale-cli']);
    expect(flag.stdout).toBe(command.stdout);
  });

  it('emits a focused impression JSON schema', () => {
    const result = runCli(['impression', 'fixtures/good-cli', '--json']);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('metrics');
    expect(parsed).toHaveProperty('score');
    expect(parsed).not.toHaveProperty('scores');
  });

  it('supports verbose and quiet terminal modes', () => {
    const verbose = runCli(['scan', 'fixtures/good-cli', '--verbose']);
    const quiet = runCli(['scan', 'fixtures/stale-cli', '--quiet']);
    expect(verbose.stdout).toContain('RULE RESULTS');
    expect(quiet.stdout).toMatch(/^readme-fit \d+\/100/m);
    expect(quiet.stdout).not.toContain('VERIFICATION COVERAGE');
  });

  it('rejects incompatible output modes', () => {
    const result = runCli(['scan', '.', '--verbose', '--quiet']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/cannot be used together/i);
  });

  it('explains rules and rejects unknown rule IDs', () => {
    expect(runCli(['explain', 'correctness.command.exists']).stdout).toMatch(
      /without executing/i,
    );
    const missing = runCli(['explain', 'nonexistent.rule']);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('Unknown rule');
  });

  it('lists discoverable rule IDs', () => {
    const result = runCli(['list-rules']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('correctness.command.exists');
    expect(result.stdout).toContain('onboarding.quick-start.present');
  });

  it('enforces fail-on severity and category thresholds', () => {
    expect(runCli(['scan', 'fixtures/stale-cli', '--fail-on', 'critical']).status).toBe(1);
    expect(runCli(['scan', 'fixtures/stale-cli', '--fail-on', 'correctness']).status).toBe(
      1,
    );
    expect(runCli(['scan', 'fixtures/good-cli', '--fail-on', 'critical']).status).toBe(0);
  });

  it('captures baselines and fails CI only for new regressions', () => {
    const temporary = mkdtempSync(path.join(tmpdir(), 'readme-fit-baseline-'));
    try {
      const captured = runCli(['baseline', 'fixtures/good-cli']);
      expect(captured.status).toBe(0);
      const baselinePath = path.join(temporary, 'baseline.json');
      writeFileSync(baselinePath, captured.stdout);

      const regression = runCli([
        'scan',
        'fixtures/stale-cli',
        '--baseline',
        baselinePath,
        '--fail-on',
        'critical',
      ]);
      expect(regression.status).toBe(1);
      expect(regression.stdout).toContain('BASELINE REGRESSION');

      const unchanged = runCli([
        'scan',
        'fixtures/good-cli',
        '--baseline',
        baselinePath,
        '--fail-on',
        'critical',
      ]);
      expect(unchanged.status).toBe(0);
      expect(unchanged.stdout).toContain('New findings       0');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
