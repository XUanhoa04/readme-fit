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
});
