import path from 'node:path';
import type {
  ProjectProfile,
  ProjectType,
  RepositorySnapshot,
} from '../../models/index.js';
import { rubricStatus } from '../../scoring/weights.js';
import { pythonPackageName } from '../../core/repository/python-metadata.js';

const EXTENSION_LANGUAGES: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.c': 'C',
};

interface ClassificationSignal {
  type: ProjectType;
  score: number;
  reason: string;
  source: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dependencies(pkg: Record<string, unknown>): Set<string> {
  return new Set([
    ...Object.keys(record(pkg.dependencies)),
    ...Object.keys(record(pkg.devDependencies)),
    ...Object.keys(record(pkg.peerDependencies)),
  ]);
}

function inferSignals(repository: RepositorySnapshot): ClassificationSignal[] {
  const pkg = repository.packageJson ?? {};
  const deps = dependencies(pkg);
  const signals: ClassificationSignal[] = [];
  const add = (type: ProjectType, score: number, reason: string, source: string) =>
    signals.push({ type, score, reason, source });

  if (repository.files.some((file) => /^action\.ya?ml$/i.test(file))) {
    add('github-action', 95, 'A root action manifest was found.', 'action.yml');
  }
  if (record(pkg.engines).vscode || pkg.contributes) {
    add(
      'vscode-extension',
      115,
      'VS Code engine or contribution metadata exists.',
      'package.json',
    );
  }
  const hasNodeCli = Boolean(
    (typeof pkg.bin === 'string' && pkg.bin) || Object.keys(record(pkg.bin)).length,
  );
  const hasPythonCli = Boolean(
    repository.pyproject &&
    /(?:\[project\.scripts\]|\[tool\.poetry\.scripts\])/i.test(repository.pyproject),
  );
  const hasRustCli = Boolean(
    repository.cargoToml &&
    (/(?:\[\[bin\]\])/i.test(repository.cargoToml) ||
      repository.files.includes('src/main.rs')),
  );
  const hasGoCli = Boolean(
    repository.goMod &&
    (repository.files.includes('main.go') ||
      repository.files.some((file) => /^cmd\/.*main\.go$/i.test(file))),
  );
  const workspaceCli = repository.workspace.packages.find((item) => item.hasCli);
  if (hasNodeCli || hasPythonCli || hasRustCli || hasGoCli || workspaceCli) {
    const source = hasNodeCli
      ? 'package.json'
      : hasPythonCli
        ? 'pyproject.toml'
        : hasRustCli
          ? 'Cargo.toml'
          : hasGoCli
            ? 'go.mod'
            : (workspaceCli?.manifestPath ?? 'repository');
    add('cli', 100, 'Executable package metadata or a CLI entrypoint was found.', source);
    add(
      'developer-tool',
      55,
      'The repository exposes a command-line developer surface.',
      source,
    );
  }
  if (deps.has('electron') || repository.files.includes('src-tauri/tauri.conf.json')) {
    add(
      'desktop-app',
      110,
      'Electron or Tauri desktop application evidence was found.',
      deps.has('electron') ? 'package.json' : 'src-tauri/tauri.conf.json',
    );
  }
  if (
    deps.has('react-native') ||
    deps.has('expo') ||
    repository.files.some((file) =>
      /(?:^|\/)android\/build\.gradle$|\.xcodeproj\//i.test(file),
    )
  ) {
    add(
      'mobile-app',
      105,
      'Mobile framework or platform project evidence was found.',
      'repository',
    );
  }
  if (
    [...deps].some((name) =>
      ['next', 'nuxt', 'vite', 'react', 'vue', '@angular/core', 'svelte'].includes(name),
    )
  ) {
    add('web-app', 90, 'A web application framework dependency was found.', 'package.json');
  }
  if (
    [...deps].some((name) =>
      ['express', 'fastify', 'koa', 'hapi', '@nestjs/core'].includes(name),
    )
  ) {
    add('api', 95, 'An HTTP API framework dependency was found.', 'package.json');
  }
  if (
    repository.files.some((file) =>
      /(?:^|\/)(?:model[_-]?card(?:\.md)?|config\.json)$|\.safetensors$/i.test(file),
    )
  ) {
    add('ai-model', 95, 'Model metadata or weights were found.', 'repository');
  }
  if ([...deps].some((name) => /(?:langchain|autogen|crewai|ai-sdk)/i.test(name))) {
    add('ai-agent', 90, 'An agent framework dependency was found.', 'package.json');
  }
  if (
    repository.files.some((file) => /(?:docker-compose|terraform|\.tf$|helm)/i.test(file))
  ) {
    add('infrastructure', 85, 'Infrastructure-as-code files were found.', 'repository');
  }
  if (
    !signals.some((signal) => signal.type === 'cli') &&
    (pkg.main ||
      pkg.module ||
      pkg.exports ||
      repository.pyproject ||
      repository.cargoToml ||
      repository.goMod)
  ) {
    add(
      'library',
      75,
      'Reusable package metadata is present without a CLI entrypoint.',
      'repository',
    );
  }
  if (
    !signals.some((signal) => ['cli', 'library'].includes(signal.type)) &&
    repository.workspace.packages.length > 0
  ) {
    add('library', 70, 'The workspace contains reusable package manifests.', 'workspace');
  }
  if (
    !signals.length &&
    repository.files.some((file) => /^(?:docs|documentation)\//i.test(file))
  ) {
    add('documentation', 45, 'A documentation tree was found.', 'repository');
  }
  if (
    !signals.length &&
    repository.files.some((file) => /^(?:tutorials?|lessons?)\//i.test(file))
  ) {
    add('tutorial', 50, 'Tutorial or lesson content was found.', 'repository');
  }
  if (
    repository.files.some((file) =>
      /^(?:data|datasets?)\/.*\.(?:csv|jsonl|parquet|arrow)$/i.test(file),
    )
  ) {
    add('dataset', 80, 'Dataset artifacts were found.', 'repository');
  }
  return signals.sort(
    (left, right) => right.score - left.score || left.type.localeCompare(right.type),
  );
}

function inferredTypes(signals: ClassificationSignal[]): ProjectType[] {
  const best = new Map<ProjectType, ClassificationSignal>();
  for (const signal of signals) {
    const current = best.get(signal.type);
    if (!current || signal.score > current.score) best.set(signal.type, signal);
  }
  return [...best.values()]
    .sort((left, right) => right.score - left.score || left.type.localeCompare(right.type))
    .map((signal) => signal.type);
}

function confidenceFor(signals: ClassificationSignal[]): number {
  const types = inferredTypes(signals);
  const top = signals.find((signal) => signal.type === types[0]);
  const second = signals.find((signal) => signal.type === types[1]);
  if (!top) return 0.25;
  if (!second) return 0.95;
  const margin = Math.max(0, top.score - second.score) / Math.max(top.score, 1);
  return Math.round((0.6 + Math.min(0.35, margin * 0.7)) * 100) / 100;
}

export function classifyProject(
  repository: RepositorySnapshot,
  configuredType = 'auto',
): ProjectProfile {
  const signals = inferSignals(repository);
  const inferred = inferredTypes(signals);
  const configured =
    configuredType !== 'auto' ? (configuredType as ProjectType) : undefined;
  const primaryType = configured ?? inferred[0] ?? 'unknown';
  const secondaryTypes = inferred.filter((type) => type !== primaryType);
  const languageCounts = new Map<string, number>();
  for (const file of repository.files) {
    const language = EXTENSION_LANGUAGES[path.extname(file).toLowerCase()];
    if (language) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  }
  const pkg = repository.packageJson ?? {};
  const rootPackage = repository.workspace.packages.find((item) => item.path === '.');
  const bin = pkg.bin;
  const fallbackEntrypoints = [
    pkg.main,
    pkg.module,
    ...(typeof bin === 'string'
      ? [bin]
      : Object.values(record(bin)).filter(
          (item): item is string => typeof item === 'string',
        )),
  ].filter((item): item is string => typeof item === 'string');
  const entrypoints = rootPackage?.entrypoints ?? fallbackEntrypoints;
  const workspaceManagers = [
    ...new Set(repository.workspace.packages.map((item) => item.packageManager)),
  ].filter((item): item is string => typeof item === 'string');
  const packageManagers = workspaceManagers.length
    ? workspaceManagers
    : [
        repository.files.includes('package-lock.json') ? 'npm' : '',
        repository.files.includes('pnpm-lock.yaml') ? 'pnpm' : '',
        repository.files.includes('yarn.lock') ? 'yarn' : '',
        repository.files.includes('bun.lock') || repository.files.includes('bun.lockb')
          ? 'bun'
          : '',
        repository.files.includes('deno.json') ||
        repository.files.includes('deno.jsonc') ||
        repository.files.includes('deno.lock')
          ? 'deno'
          : '',
        repository.cargoToml ? 'cargo' : '',
        repository.goMod ? 'go' : '',
      ].filter(Boolean);
  const profile: ProjectProfile = {
    primaryType,
    secondaryTypes,
    languages: [...languageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 4),
    packageManagers,
    hasCli: primaryType === 'cli' || secondaryTypes.includes('cli'),
    hasWebUi: primaryType === 'web-app' || secondaryTypes.includes('web-app'),
    hasTests: repository.files.some((file) =>
      /(?:^|\/)(?:test|tests|__tests__)(?:\/|\.)|\.(?:test|spec)\.[^.]+$/i.test(file),
    ),
    hasLicense: Boolean(repository.licenseText),
    entrypoints,
    confidence: configured ? 1 : confidenceFor(signals),
    rubricStatus: rubricStatus(primaryType),
    classificationEvidence: signals,
    workspace: {
      isMonorepo: repository.workspace.isMonorepo,
      packageCount: repository.workspace.packages.length,
    },
  };
  const packageName =
    typeof pkg.name === 'string' ? pkg.name : pythonPackageName(repository.pyproject);
  if (packageName) profile.packageName = packageName;
  return profile;
}
