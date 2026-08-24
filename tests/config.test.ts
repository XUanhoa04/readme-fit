import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';
import { loadConfig } from '../src/core/config/config.js';
import { ruleWeight } from '../src/scoring/weights.js';

const temporaryDirectories: string[] = [];

async function temporaryRepository(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'readme-fit-config-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('configuration', () => {
  it('loads defaults when no config exists', async () => {
    const config = await loadConfig(await temporaryRepository());
    expect(config.version).toBe(2);
    expect(config.project.type).toBe('auto');
    expect(config.scoring.preset).toBe('balanced');
  });

  it('migrates version 1 configuration to the version 2 internal model', async () => {
    const root = await temporaryRepository();
    await writeFile(
      path.join(root, '.readme-fit.yml'),
      'version: 1\nproject:\n  type: cli\n',
    );
    const config = await loadConfig(root);
    expect(config).toMatchObject({ version: 2, migratedFrom: 1, project: { type: 'cli' } });
  });

  it('extends local version 2 configuration with child overrides', async () => {
    const root = await temporaryRepository();
    await writeFile(
      path.join(root, 'base.yml'),
      'version: 2\nproject:\n  type: cli\nrules:\n  trust: false\nscoring:\n  preset: oss\n',
    );
    await writeFile(
      path.join(root, '.readme-fit.yml'),
      'version: 2\nextends: ./base.yml\nscoring:\n  preset: portfolio\n',
    );
    const config = await loadConfig(root);
    expect(config.project.type).toBe('cli');
    expect(config.rules.trust).toBe(false);
    expect(config.scoring.preset).toBe('portfolio');
  });

  it('loads extended configuration through a canonical repository alias', async () => {
    const physicalRoot = await temporaryRepository();
    const aliasContainer = await temporaryRepository();
    await writeFile(
      path.join(physicalRoot, 'base.yml'),
      'version: 2\nproject:\n  type: cli\n',
    );
    await writeFile(
      path.join(physicalRoot, '.readme-fit.yml'),
      'version: 2\nextends: ./base.yml\n',
    );
    const aliasRoot = path.join(aliasContainer, 'repository-alias');
    await symlink(
      physicalRoot,
      aliasRoot,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const config = await loadConfig(aliasRoot);

    expect(config.project.type).toBe('cli');
  });

  it('rejects escaping and cyclic config extends', async () => {
    const escaping = await temporaryRepository();
    await writeFile(
      path.join(escaping, '.readme-fit.yml'),
      'version: 2\nextends: ../outside.yml\n',
    );
    await expect(loadConfig(escaping)).rejects.toThrow(/inside the repository/);

    const cyclic = await temporaryRepository();
    await writeFile(
      path.join(cyclic, '.readme-fit.yml'),
      'version: 2\nextends: ./base.yml\n',
    );
    await writeFile(
      path.join(cyclic, 'base.yml'),
      'version: 2\nextends: ./.readme-fit.yml\n',
    );
    await expect(loadConfig(cyclic)).rejects.toThrow(/cycle/);
  });

  it('applies declarative per-rule enablement and weight overrides', async () => {
    const root = await temporaryRepository();
    await writeFile(path.join(root, 'README.md'), '# Project\n');
    await writeFile(
      path.join(root, '.readme-fit.yml'),
      'version: 2\nrules:\n  overrides:\n    hero.explanation.present:\n      weight: 0\n    impression.proof:\n      enabled: false\n',
    );
    const report = await analyzeRepository(root);
    expect(
      report.scores.clarity?.rules.find((rule) => rule.id === 'hero.explanation.present')
        ?.weight,
    ).toBe(0);
    expect(
      report.scores.impression?.rules.some((rule) => rule.id === 'impression.proof'),
    ).toBe(false);
  });

  it('supports the .readme-fit.yaml extension', async () => {
    const root = await temporaryRepository();
    await writeFile(
      path.join(root, '.readme-fit.yaml'),
      'version: 1\nproject:\n  type: library\nscoring:\n  preset: portfolio\n',
    );
    const config = await loadConfig(root);
    expect(config.project.type).toBe('library');
    expect(config.scoring.preset).toBe('portfolio');
  });

  it.each([
    ['project type', 'project:\n  type: banana\n', /Invalid project\.type/],
    ['preset', 'scoring:\n  preset: loud\n', /Invalid scoring\.preset/],
    ['rule value', 'rules:\n  correctness: yes-please\n', /must be boolean/],
    ['top-level key', 'scorign:\n  preset: oss\n', /Unknown top-level config key/],
    ['nested key', 'project:\n  kind: cli\n', /Unknown project key/],
  ])('rejects invalid %s configuration', async (_label, contents, expected) => {
    const root = await temporaryRepository();
    await writeFile(path.join(root, '.readme-fit.yml'), contents);
    await expect(loadConfig(root)).rejects.toThrow(expected);
  });

  it('rejects unknown ignored rule IDs', async () => {
    const root = await temporaryRepository();
    await writeFile(
      path.join(root, '.readme-fit.yml'),
      'ignore:\n  rules:\n    - correctness.typo\n',
    );
    await expect(loadConfig(root, new Set(['correctness.command.exists']))).rejects.toThrow(
      /Unknown rule ID/,
    );
  });

  it('rejects ambiguous dual config files', async () => {
    const root = await temporaryRepository();
    await Promise.all([
      writeFile(path.join(root, '.readme-fit.yml'), 'version: 1\n'),
      writeFile(path.join(root, '.readme-fit.yaml'), 'version: 1\n'),
    ]);
    await expect(loadConfig(root)).rejects.toThrow(/only one config file/i);
  });

  it('changes rule weights across named presets', () => {
    expect(ruleWeight('impression.why', 'cli', 'balanced')).toBe(20);
    expect(ruleWeight('impression.why', 'cli', 'portfolio')).toBe(30);
    expect(ruleWeight('visual.demo.present', 'cli', 'minimal')).toBe(3);
    expect(ruleWeight('trust.signals.present', 'cli', 'oss')).toBe(40);
  });

  it('changes an actual report when the preset changes', async () => {
    const root = await temporaryRepository();
    await cp(path.resolve('fixtures/stale-cli'), root, { recursive: true });
    await writeFile(path.join(root, '.readme-fit.yml'), 'scoring:\n  preset: portfolio\n');
    const portfolio = await analyzeRepository(root);
    await writeFile(path.join(root, '.readme-fit.yml'), 'scoring:\n  preset: balanced\n');
    const balanced = await analyzeRepository(root);
    expect(portfolio.scores.impression?.score).not.toBe(balanced.scores.impression?.score);
  });
});
