import path from 'node:path';
import type {
  ProjectProfile,
  ProjectType,
  RepositorySnapshot,
} from '../../models/index.js';

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

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dependencies(pkg: Record<string, unknown>): Set<string> {
  return new Set([
    ...Object.keys(record(pkg.dependencies)),
    ...Object.keys(record(pkg.devDependencies)),
  ]);
}

function inferTypes(repository: RepositorySnapshot): ProjectType[] {
  const pkg = repository.packageJson ?? {};
  const deps = dependencies(pkg);
  const types: ProjectType[] = [];
  if (repository.files.some((file) => /^action\.ya?ml$/i.test(file)))
    types.push('github-action');
  if (record(pkg.engines).vscode || pkg.contributes) types.push('vscode-extension');
  if (pkg.bin && Object.keys(record(pkg.bin)).length > 0)
    types.push('cli', 'developer-tool');
  if (deps.has('electron') || repository.files.includes('src-tauri/tauri.conf.json'))
    types.push('desktop-app');
  if (
    [...deps].some((name) =>
      ['next', 'nuxt', 'vite', 'react', 'vue', '@angular/core', 'svelte'].includes(name),
    )
  )
    types.push('web-app');
  if (
    [...deps].some((name) =>
      ['express', 'fastify', 'koa', 'hapi', '@nestjs/core'].includes(name),
    )
  )
    types.push('api');
  if (
    repository.files.some((file) =>
      /(?:^|\/)(?:model[_-]?card(?:\.md)?|config\.json)$|\.safetensors$/i.test(file),
    )
  )
    types.push('ai-model');
  if ([...deps].some((name) => /(?:langchain|autogen|crewai|ai-sdk)/i.test(name)))
    types.push('ai-agent');
  if (
    repository.files.some((file) => /(?:docker-compose|terraform|\.tf$|helm)/i.test(file))
  )
    types.push('infrastructure');
  if (
    !types.length &&
    (pkg.main ||
      pkg.module ||
      pkg.exports ||
      repository.pyproject ||
      repository.cargoToml ||
      repository.goMod)
  )
    types.push('library');
  if (
    !types.length &&
    repository.files.some((file) => /^(?:docs|tutorials?)\//i.test(file))
  )
    types.push('documentation');
  return [...new Set(types)];
}

export function classifyProject(
  repository: RepositorySnapshot,
  configuredType = 'auto',
): ProjectProfile {
  const inferred = inferTypes(repository);
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
  const entrypoints = [pkg.main, pkg.module, ...Object.keys(record(pkg.bin))].filter(
    (item): item is string => typeof item === 'string',
  );
  const packageManagers = [
    repository.files.includes('package-lock.json') ? 'npm' : '',
    repository.files.includes('pnpm-lock.yaml') ? 'pnpm' : '',
    repository.files.includes('yarn.lock') ? 'yarn' : '',
    repository.files.includes('uv.lock') ? 'uv' : '',
    repository.files.includes('poetry.lock') ? 'poetry' : '',
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
    confidence: configured ? 1 : inferred.length ? 0.9 : 0.25,
  };
  if (typeof pkg.name === 'string') profile.packageName = pkg.name;
  return profile;
}
