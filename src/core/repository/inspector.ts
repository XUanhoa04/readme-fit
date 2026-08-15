import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
import type { RepositorySnapshot } from '../../models/index.js';

const DEFAULT_IGNORES = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.cache/',
  'vendor/',
  'target/',
  '.venv/',
  'venv/',
];

export const MAX_INSPECTED_TEXT_BYTES = 1_048_576;

async function readOptional(root: string, relative: string): Promise<string | undefined> {
  try {
    const target = path.join(root, relative);
    const metadata = await stat(target);
    if (metadata.size > MAX_INSPECTED_TEXT_BYTES) {
      throw new Error(
        `${relative} exceeds the ${MAX_INSPECTED_TEXT_BYTES}-byte static inspection limit.`,
      );
    }
    return await readFile(target, 'utf8');
  } catch (error) {
    if (error instanceof Error && /static inspection limit/.test(error.message)) throw error;
    return undefined;
  }
}

async function collectFiles(root: string, extraIgnores: string[] = []): Promise<string[]> {
  const matcher = ignore().add(DEFAULT_IGNORES).add(extraIgnores);
  const gitignore = await readOptional(root, '.gitignore');
  if (gitignore) matcher.add(gitignore);
  const files: string[] = [];

  async function walk(relative: string): Promise<void> {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      const next = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
      const ignoredPath = entry.isDirectory() ? `${next}/` : next;
      if (matcher.ignores(ignoredPath)) continue;
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile()) files.push(next);
      if (files.length >= 10_000) return;
    }
  }

  await walk('');
  return files.sort();
}

export async function inspectRepository(
  rootInput: string,
  extraIgnores: string[] = [],
): Promise<RepositorySnapshot> {
  const root = path.resolve(rootInput);
  const files = await collectFiles(root, extraIgnores);
  const packageRaw = await readOptional(root, 'package.json');
  let packageJson: Record<string, unknown> | undefined;
  if (packageRaw) {
    try {
      packageJson = JSON.parse(packageRaw) as Record<string, unknown>;
    } catch {
      packageJson = undefined;
    }
  }
  const snapshot: RepositorySnapshot = { root, files };
  if (packageJson) snapshot.packageJson = packageJson;
  const optional: Array<[keyof RepositorySnapshot, string]> = [
    ['pyproject', 'pyproject.toml'],
    ['cargoToml', 'Cargo.toml'],
    ['goMod', 'go.mod'],
    ['nvmrc', '.nvmrc'],
    ['nodeVersion', '.node-version'],
    ['pythonVersion', '.python-version'],
  ];
  for (const [key, filename] of optional) {
    const value = await readOptional(root, filename);
    if (value !== undefined) Object.assign(snapshot, { [key]: value.trim() });
  }
  const licenseName = files.find((file) =>
    /^licen[sc]e(?:\.|$)/i.test(path.basename(file)),
  );
  if (licenseName) {
    const licenseText = await readOptional(root, licenseName);
    if (licenseText !== undefined) snapshot.licenseText = licenseText;
  }
  return snapshot;
}

export { readOptional };
