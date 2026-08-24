import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { parse as parseToml } from 'smol-toml';
import YAML from 'yaml';
import type { RepositoryPackage, WorkspaceSnapshot } from '../../models/index.js';

const MAX_MANIFESTS = 500;
const MAX_MANIFEST_BYTES = 1_048_576;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readManifest(root: string, relative: string): Promise<string | undefined> {
  try {
    const target = path.join(root, relative);
    const metadata = await stat(target);
    if (metadata.size > MAX_MANIFEST_BYTES) return undefined;
    return await readFile(target, 'utf8');
  } catch {
    return undefined;
  }
}

function manifestDirectory(manifest: string): string {
  const directory = path.posix.dirname(manifest);
  return directory === '.' ? '.' : directory;
}

function matchesWorkspace(directory: string, patterns: string[]): boolean {
  if (directory === '.') return true;
  const included = patterns
    .filter((pattern) => !pattern.startsWith('!'))
    .some((pattern) => minimatch(directory, pattern.replace(/\/$/, ''), { dot: true }));
  const excluded = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .some((pattern) =>
      minimatch(directory, pattern.slice(1).replace(/\/$/, ''), { dot: true }),
    );
  return included && !excluded;
}

function readmesFor(files: string[], directory: string): string[] {
  const prefix = directory === '.' ? '' : `${directory}/`;
  return files.filter(
    (file) =>
      path.posix.dirname(file) === directory &&
      /^readme(?:\.[^.]+)?\.md$|^readme\.md$/i.test(file.slice(prefix.length)),
  );
}

function managerFor(files: string[], directory: string, ecosystem: string): string {
  const prefix = directory === '.' ? '' : `${directory}/`;
  const has = (filename: string) => files.includes(`${prefix}${filename}`);
  if (ecosystem === 'node') {
    if (has('pnpm-lock.yaml')) return 'pnpm';
    if (has('yarn.lock')) return 'yarn';
    if (has('bun.lock') || has('bun.lockb')) return 'bun';
    return 'npm';
  }
  if (ecosystem === 'python') {
    if (has('uv.lock')) return 'uv';
    if (has('poetry.lock')) return 'poetry';
    return 'pip';
  }
  return ecosystem === 'rust' ? 'cargo' : 'go';
}

function nodeWorkspacePatterns(pkg: Record<string, unknown>): string[] {
  if (Array.isArray(pkg.workspaces)) {
    return pkg.workspaces.filter((item): item is string => typeof item === 'string');
  }
  const workspaces = record(pkg.workspaces);
  return Array.isArray(workspaces.packages)
    ? workspaces.packages.filter((item): item is string => typeof item === 'string')
    : [];
}

function nested(root: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = root;
  for (const key of keys) current = record(current)[key];
  return current;
}

function tomlPatterns(document: Record<string, unknown>, keys: string[]): string[] {
  const value = nested(document, keys);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function goWorkPatterns(raw: string | undefined): string[] {
  if (!raw) return [];
  const body = /use\s*\(([^)]*)\)/s.exec(raw)?.[1] ?? raw;
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.startsWith('./'))
    .map((line) => line.replace(/^\.\//, '').replace(/\/$/, ''));
}

function nodePackage(
  manifestPath: string,
  pkg: Record<string, unknown>,
  files: string[],
): RepositoryPackage {
  const directory = manifestDirectory(manifestPath);
  const bin = pkg.bin;
  const binEntrypoints =
    typeof bin === 'string'
      ? [bin]
      : Object.values(record(bin)).filter(
          (item): item is string => typeof item === 'string',
        );
  const entrypoints = [pkg.main, pkg.module, ...binEntrypoints].filter(
    (item): item is string => typeof item === 'string',
  );
  const name = typeof pkg.name === 'string' ? pkg.name : undefined;
  return {
    id: `node:${directory}:${name ?? manifestPath}`,
    ecosystem: 'node',
    ...(name ? { name } : {}),
    path: directory,
    manifestPath,
    private: pkg.private === true,
    hasCli: binEntrypoints.length > 0,
    entrypoints,
    readmes: readmesFor(files, directory),
    packageManager: managerFor(files, directory, 'node'),
  };
}

function tomlPackage(
  ecosystem: 'python' | 'rust',
  manifestPath: string,
  document: Record<string, unknown>,
  files: string[],
): RepositoryPackage | undefined {
  const directory = manifestDirectory(manifestPath);
  const project = record(document.project);
  const poetry = record(nested(document, ['tool', 'poetry']));
  const cargo = record(document.package);
  const nameValue = ecosystem === 'python' ? (project.name ?? poetry.name) : cargo.name;
  const name = typeof nameValue === 'string' ? nameValue : undefined;
  if (!name) return undefined;
  const scripts =
    ecosystem === 'python' ? record(nested(document, ['project', 'scripts'])) : {};
  const main = `${directory === '.' ? '' : `${directory}/`}src/main.rs`;
  const entrypoints =
    ecosystem === 'python'
      ? Object.keys(scripts)
      : files.includes(main)
        ? ['src/main.rs']
        : [];
  return {
    id: `${ecosystem}:${directory}:${name ?? manifestPath}`,
    ecosystem,
    name,
    path: directory,
    manifestPath,
    private: false,
    hasCli: entrypoints.length > 0,
    entrypoints,
    readmes: readmesFor(files, directory),
    packageManager: managerFor(files, directory, ecosystem),
  };
}

function goPackage(manifestPath: string, raw: string, files: string[]): RepositoryPackage {
  const directory = manifestDirectory(manifestPath);
  const name = /^module\s+(\S+)/m.exec(raw)?.[1];
  const prefix = directory === '.' ? '' : `${directory}/`;
  const entrypoints = files
    .filter(
      (file) =>
        file.startsWith(prefix) &&
        (file === `${prefix}main.go` ||
          /^cmd\/.*\/main\.go$/.test(file.slice(prefix.length))),
    )
    .map((file) => file.slice(prefix.length));
  return {
    id: `go:${directory}:${name ?? manifestPath}`,
    ecosystem: 'go',
    ...(name ? { name } : {}),
    path: directory,
    manifestPath,
    private: false,
    hasCli: entrypoints.length > 0,
    entrypoints,
    readmes: readmesFor(files, directory),
    packageManager: 'go',
  };
}

export async function inspectWorkspace(
  root: string,
  files: string[],
): Promise<{
  workspace: WorkspaceSnapshot;
  issues: Array<{ path: string; message: string }>;
}> {
  const issues: Array<{ path: string; message: string }> = [];
  const patterns: string[] = [];
  const parsedNode = new Map<string, Record<string, unknown>>();
  const parsedToml = new Map<string, Record<string, unknown>>();
  const rawGo = new Map<string, string>();
  const manifestCandidates = files.filter((file) =>
    /(?:^|\/)(?:package\.json|pyproject\.toml|Cargo\.toml|go\.mod)$/i.test(file),
  );
  if (manifestCandidates.length > MAX_MANIFESTS) {
    issues.push({
      path: '.',
      message: `Workspace manifest inspection stopped at ${MAX_MANIFESTS} files.`,
    });
  }
  const manifests = manifestCandidates.slice(0, MAX_MANIFESTS);

  for (const manifest of manifests) {
    const raw = await readManifest(root, manifest);
    if (raw === undefined) continue;
    try {
      if (/package\.json$/i.test(manifest)) {
        parsedNode.set(manifest, record(JSON.parse(raw) as unknown));
      } else if (/go\.mod$/i.test(manifest)) rawGo.set(manifest, raw);
      else parsedToml.set(manifest, parseToml(raw));
    } catch {
      issues.push({ path: manifest, message: `${manifest} could not be parsed.` });
    }
  }

  const rootPackage = parsedNode.get('package.json');
  if (rootPackage) patterns.push(...nodeWorkspacePatterns(rootPackage));
  const pnpmRaw = await readManifest(root, 'pnpm-workspace.yaml');
  if (pnpmRaw) {
    try {
      const value = record(YAML.parse(pnpmRaw));
      if (Array.isArray(value.packages)) {
        patterns.push(
          ...value.packages.filter((item): item is string => typeof item === 'string'),
        );
      }
    } catch {
      issues.push({
        path: 'pnpm-workspace.yaml',
        message: 'pnpm-workspace.yaml could not be parsed.',
      });
    }
  }
  const rootPyproject = parsedToml.get('pyproject.toml');
  if (rootPyproject) {
    patterns.push(...tomlPatterns(rootPyproject, ['tool', 'uv', 'workspace', 'members']));
    patterns.push(
      ...tomlPatterns(rootPyproject, ['tool', 'uv', 'workspace', 'exclude']).map(
        (pattern) => `!${pattern}`,
      ),
    );
  }
  const rootCargo = parsedToml.get('Cargo.toml');
  if (rootCargo) {
    patterns.push(...tomlPatterns(rootCargo, ['workspace', 'members']));
    patterns.push(
      ...tomlPatterns(rootCargo, ['workspace', 'exclude']).map((pattern) => `!${pattern}`),
    );
  }
  const goWork = await readManifest(root, 'go.work');
  patterns.push(...goWorkPatterns(goWork));
  const uniquePatterns = [...new Set(patterns)];

  const packages: RepositoryPackage[] = [];
  for (const [manifest, pkg] of parsedNode) {
    if (matchesWorkspace(manifestDirectory(manifest), uniquePatterns)) {
      packages.push(nodePackage(manifest, pkg, files));
    }
  }
  for (const [manifest, document] of parsedToml) {
    if (!matchesWorkspace(manifestDirectory(manifest), uniquePatterns)) continue;
    const parsed = tomlPackage(
      /pyproject\.toml$/i.test(manifest) ? 'python' : 'rust',
      manifest,
      document,
      files,
    );
    if (parsed) packages.push(parsed);
  }
  for (const [manifest, raw] of rawGo) {
    if (matchesWorkspace(manifestDirectory(manifest), uniquePatterns)) {
      packages.push(goPackage(manifest, raw, files));
    }
  }

  const rootManagers = [
    files.includes('package-lock.json') ? 'npm' : '',
    files.includes('pnpm-lock.yaml') ? 'pnpm' : '',
    files.includes('yarn.lock') ? 'yarn' : '',
    files.includes('bun.lock') || files.includes('bun.lockb') ? 'bun' : '',
  ].filter(Boolean);
  return {
    workspace: {
      isMonorepo: uniquePatterns.length > 0 && packages.length > 1,
      patterns: uniquePatterns,
      packages: packages.sort((left, right) => left.id.localeCompare(right.id)),
      lockfileConflicts: rootManagers.length > 1 ? rootManagers : [],
    },
    issues,
  };
}
