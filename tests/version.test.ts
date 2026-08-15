import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version.js';

describe('release version', () => {
  it('keeps the CLI and package manifest versions aligned', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      version: string;
    };
    expect(VERSION).toBe(packageJson.version);
  });
});
