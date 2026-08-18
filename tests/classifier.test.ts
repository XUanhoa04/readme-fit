import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectRepository } from '../src/core/repository/inspector.js';
import { classifyProject } from '../src/classifiers/project-type/classifier.js';

const fixture = (name: string) => path.resolve('fixtures', name);

describe('project classification', () => {
  it('classifies a package with bin as CLI and developer tool', async () => {
    const profile = classifyProject(await inspectRepository(fixture('good-cli')));
    expect(profile.primaryType).toBe('cli');
    expect(profile.secondaryTypes).toContain('developer-tool');
    expect(profile.hasCli).toBe(true);
  });

  it('classifies an Electron package as a desktop app', async () => {
    expect(
      classifyProject(await inspectRepository(fixture('desktop-app'))).primaryType,
    ).toBe('desktop-app');
  });

  it('does not mistake tsconfig.json for AI model metadata', async () => {
    const profile = classifyProject(
      await inspectRepository(path.resolve('.'), ['fixtures/**']),
    );
    expect(profile.primaryType).toBe('cli');
    expect(profile.secondaryTypes).not.toContain('ai-model');
  });

  it('detects bun and deno package managers and non-Node CLI entrypoints', () => {
    const bunProfile = classifyProject({
      root: '/mock',
      files: ['bun.lockb', 'package.json', 'src/index.ts'],
      packageJson: { name: 'bun-app' },
    });
    expect(bunProfile.packageManagers).toContain('bun');

    const denoProfile = classifyProject({
      root: '/mock',
      files: ['deno.json', 'main.ts'],
    });
    expect(denoProfile.packageManagers).toContain('deno');

    const rustCliProfile = classifyProject({
      root: '/mock',
      files: ['Cargo.toml', 'src/main.rs'],
      cargoToml: '[package]\nname = "my-cli"\n',
    });
    expect(rustCliProfile.primaryType).toBe('cli');
    expect(rustCliProfile.hasCli).toBe(true);

    const pythonCliProfile = classifyProject({
      root: '/mock',
      files: ['pyproject.toml', 'src/tool/__init__.py'],
      pyproject: '[project.scripts]\nmy-cmd = "tool.cli:main"\n',
    });
    expect(pythonCliProfile.primaryType).toBe('cli');
    expect(pythonCliProfile.hasCli).toBe(true);
  });
});
