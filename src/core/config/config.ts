import path from 'node:path';
import YAML from 'yaml';
import type { ProjectType } from '../../models/index.js';
import type { ScoringPreset } from '../../scoring/weights.js';
import { readOptional } from '../repository/inspector.js';

const PROJECT_TYPES: ProjectType[] = [
  'cli',
  'library',
  'sdk',
  'api',
  'web-app',
  'desktop-app',
  'mobile-app',
  'developer-tool',
  'github-action',
  'vscode-extension',
  'ai-model',
  'ai-agent',
  'dataset',
  'template',
  'tutorial',
  'documentation',
  'infrastructure',
  'unknown',
];
const PRESETS: ScoringPreset[] = ['minimal', 'balanced', 'oss', 'portfolio'];
const RULE_GROUPS = new Set([
  'correctness',
  'completeness',
  'onboarding',
  'clarity',
  'visual_proof',
  'first_impression',
  'trust',
]);

export interface ReadmeFitConfig {
  version: 1;
  project: { type: 'auto' | ProjectType };
  readme: { path: string };
  rules: Record<string, boolean>;
  ignore: { rules: string[]; paths: string[] };
  scoring: { preset: ScoringPreset };
}

export const DEFAULT_CONFIG: ReadmeFitConfig = {
  version: 1,
  project: { type: 'auto' },
  readme: { path: 'README.md' },
  rules: {},
  ignore: { rules: [], paths: [] },
  scoring: { preset: 'balanced' },
};

function objectValue(value: unknown, location: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${location} must be a mapping.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  location: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown ${location} key(s): ${unknown.join(', ')}.`);
}

function stringArray(value: unknown, location: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${location} must be an array of strings.`);
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function display(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function validateConfig(
  parsed: Record<string, unknown>,
  knownRuleIds: ReadonlySet<string>,
): ReadmeFitConfig {
  rejectUnknown(
    parsed,
    new Set(['version', 'project', 'readme', 'rules', 'ignore', 'scoring']),
    'top-level config',
  );
  if (parsed.version !== undefined && parsed.version !== 1) {
    throw new Error(`Unsupported config version: ${display(parsed.version)}.`);
  }

  const project = objectValue(parsed.project, 'project');
  const readme = objectValue(parsed.readme, 'readme');
  const rules = objectValue(parsed.rules, 'rules');
  const ignore = objectValue(parsed.ignore, 'ignore');
  const scoring = objectValue(parsed.scoring, 'scoring');
  rejectUnknown(project, new Set(['type']), 'project');
  rejectUnknown(readme, new Set(['path']), 'readme');
  rejectUnknown(ignore, new Set(['rules', 'paths']), 'ignore');
  rejectUnknown(scoring, new Set(['preset']), 'scoring');
  rejectUnknown(rules, RULE_GROUPS, 'rules');

  const projectType = project.type ?? DEFAULT_CONFIG.project.type;
  if (
    typeof projectType !== 'string' ||
    (projectType !== 'auto' && !PROJECT_TYPES.includes(projectType as ProjectType))
  ) {
    throw new Error(`Invalid project.type: ${display(projectType)}.`);
  }
  const readmePath = readme.path ?? DEFAULT_CONFIG.readme.path;
  if (typeof readmePath !== 'string' || !readmePath.trim()) {
    throw new Error('readme.path must be a non-empty string.');
  }
  for (const [key, value] of Object.entries(rules)) {
    if (typeof value !== 'boolean') throw new Error(`rules.${key} must be boolean.`);
  }
  const ignoredRules = stringArray(ignore.rules, 'ignore.rules');
  const invalidRules = ignoredRules.filter((id) => !knownRuleIds.has(id));
  if (invalidRules.length) {
    throw new Error(`Unknown rule ID(s) in ignore.rules: ${invalidRules.join(', ')}.`);
  }
  const ignoredPaths = stringArray(ignore.paths, 'ignore.paths');
  const preset = scoring.preset ?? DEFAULT_CONFIG.scoring.preset;
  if (typeof preset !== 'string' || !PRESETS.includes(preset as ScoringPreset)) {
    throw new Error(`Invalid scoring.preset: ${display(preset)}.`);
  }

  return {
    version: 1,
    project: { type: projectType as 'auto' | ProjectType },
    readme: { path: readmePath },
    rules: rules as Record<string, boolean>,
    ignore: { rules: ignoredRules, paths: ignoredPaths },
    scoring: { preset: preset as ScoringPreset },
  };
}

export async function loadConfig(
  root: string,
  knownRuleIds: ReadonlySet<string> = new Set(),
): Promise<ReadmeFitConfig> {
  const yml = await readOptional(root, '.readme-fit.yml');
  const yaml = await readOptional(root, '.readme-fit.yaml');
  if (yml && yaml)
    throw new Error('Use only one config file: .readme-fit.yml or .readme-fit.yaml.');
  const raw = yml ?? yaml;
  if (!raw) return structuredClone(DEFAULT_CONFIG);
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid readme-fit YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validateConfig(objectValue(parsed, 'config'), knownRuleIds);
}

export function resolveReadme(root: string, config: ReadmeFitConfig): string {
  return path.resolve(root, config.readme.path);
}
