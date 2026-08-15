import path from 'node:path';
import YAML from 'yaml';
import { readOptional } from '../repository/inspector.js';

export interface ReadmeFitConfig {
  version: 1;
  project: { type: string };
  readme: { path: string };
  rules: Record<string, boolean>;
  ignore: { rules: string[]; paths: string[] };
  scoring: { preset: 'minimal' | 'balanced' | 'oss' | 'portfolio' };
}

export const DEFAULT_CONFIG: ReadmeFitConfig = {
  version: 1,
  project: { type: 'auto' },
  readme: { path: 'README.md' },
  rules: {},
  ignore: { rules: [], paths: [] },
  scoring: { preset: 'balanced' },
};

export async function loadConfig(root: string): Promise<ReadmeFitConfig> {
  const raw = await readOptional(root, '.readme-fit.yml');
  if (!raw) return structuredClone(DEFAULT_CONFIG);
  const parsed = YAML.parse(raw) as Partial<ReadmeFitConfig>;
  if (parsed.version !== undefined && parsed.version !== 1) {
    throw new Error(`Unsupported config version: ${String(parsed.version)}`);
  }
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    project: { ...DEFAULT_CONFIG.project, ...parsed.project },
    readme: { ...DEFAULT_CONFIG.readme, ...parsed.readme },
    rules: { ...DEFAULT_CONFIG.rules, ...parsed.rules },
    ignore: { ...DEFAULT_CONFIG.ignore, ...parsed.ignore },
    scoring: { ...DEFAULT_CONFIG.scoring, ...parsed.scoring },
  };
}

export function resolveReadme(root: string, config: ReadmeFitConfig): string {
  return path.resolve(root, config.readme.path);
}
