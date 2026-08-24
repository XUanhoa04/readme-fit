import path from 'node:path';
import { realpath } from 'node:fs/promises';
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
  version: 2;
  migratedFrom?: 1;
  project: { type: 'auto' | ProjectType };
  readme: { path: string };
  rules: Record<string, boolean>;
  ruleOverrides: Record<string, { enabled: boolean; weight?: number }>;
  ignore: { rules: string[]; paths: string[] };
  scoring: { preset: ScoringPreset };
}

export const DEFAULT_CONFIG: ReadmeFitConfig = {
  version: 2,
  project: { type: 'auto' },
  readme: { path: 'README.md' },
  rules: {},
  ruleOverrides: {},
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
    new Set(['version', 'extends', 'project', 'readme', 'rules', 'ignore', 'scoring']),
    'top-level config',
  );
  if (parsed.version !== undefined && parsed.version !== 1 && parsed.version !== 2) {
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
  rejectUnknown(rules, new Set([...RULE_GROUPS, 'overrides']), 'rules');

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
  const groupRules = Object.fromEntries(
    Object.entries(rules).filter(([key]) => key !== 'overrides'),
  );
  for (const [key, value] of Object.entries(groupRules)) {
    if (typeof value !== 'boolean') throw new Error(`rules.${key} must be boolean.`);
  }
  const overrides = objectValue(rules.overrides, 'rules.overrides');
  const invalidOverrides = Object.keys(overrides).filter((id) => !knownRuleIds.has(id));
  if (invalidOverrides.length) {
    throw new Error(
      `Unknown rule ID(s) in rules.overrides: ${invalidOverrides.join(', ')}.`,
    );
  }
  const ruleOverrides: ReadmeFitConfig['ruleOverrides'] = {};
  for (const [id, rawOverride] of Object.entries(overrides)) {
    const override = objectValue(rawOverride, `rules.overrides.${id}`);
    rejectUnknown(override, new Set(['enabled', 'weight']), `rules.overrides.${id}`);
    if (override.enabled !== undefined && typeof override.enabled !== 'boolean') {
      throw new Error(`rules.overrides.${id}.enabled must be boolean.`);
    }
    if (
      override.weight !== undefined &&
      (typeof override.weight !== 'number' ||
        !Number.isInteger(override.weight) ||
        override.weight < 0 ||
        override.weight > 1000)
    ) {
      throw new Error(
        `rules.overrides.${id}.weight must be an integer from 0 through 1000.`,
      );
    }
    ruleOverrides[id] = {
      enabled: override.enabled !== false,
      ...(typeof override.weight === 'number' ? { weight: override.weight } : {}),
    };
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

  const result: ReadmeFitConfig = {
    version: 2,
    project: { type: projectType as 'auto' | ProjectType },
    readme: { path: readmePath },
    rules: groupRules as Record<string, boolean>,
    ruleOverrides,
    ignore: { rules: ignoredRules, paths: ignoredPaths },
    scoring: { preset: preset as ScoringPreset },
  };
  if (parsed.version === 1) result.migratedFrom = 1;
  return result;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function mergeConfigDocuments(
  base: Record<string, unknown>,
  child: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base, ...child };
  for (const key of ['project', 'readme', 'rules', 'ignore', 'scoring']) {
    const left = objectValue(base[key], key);
    const right = objectValue(child[key], key);
    if (Object.keys(left).length || Object.keys(right).length) {
      merged[key] = { ...left, ...right };
      if (key === 'rules') {
        const leftOverrides = objectValue(left.overrides, 'rules.overrides');
        const rightOverrides = objectValue(right.overrides, 'rules.overrides');
        if (Object.keys(leftOverrides).length || Object.keys(rightOverrides).length) {
          (merged[key] as Record<string, unknown>).overrides = {
            ...leftOverrides,
            ...rightOverrides,
          };
        }
      }
    }
  }
  delete merged.extends;
  return merged;
}

function parseYaml(raw: string, label: string): Record<string, unknown> {
  try {
    return objectValue(YAML.parse(raw), label);
  } catch (error) {
    throw new Error(
      `Invalid readme-fit YAML in ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadDocument(
  root: string,
  relativeFile: string,
  seen: Set<string>,
): Promise<Record<string, unknown>> {
  const lexicalTarget = path.resolve(root, relativeFile);
  if (!isInside(root, lexicalTarget))
    throw new Error('Config extends must stay inside the repository.');
  let canonicalTarget: string;
  try {
    canonicalTarget = await realpath(lexicalTarget);
  } catch {
    throw new Error(`Extended config not found: ${relativeFile}`);
  }
  const canonicalRoot = await realpath(root);
  if (!isInside(canonicalRoot, canonicalTarget)) {
    throw new Error('Config extends must stay inside the repository.');
  }
  if (seen.has(canonicalTarget)) throw new Error('Config extends contains a cycle.');
  if (seen.size >= 8) throw new Error('Config extends exceeds the maximum depth of 8.');
  seen.add(canonicalTarget);
  const normalizedRelative = path.relative(root, canonicalTarget);
  const raw = await readOptional(root, normalizedRelative);
  if (raw === undefined) throw new Error(`Extended config not found: ${relativeFile}`);
  const document = parseYaml(raw, relativeFile);
  const extended = document.extends;
  if (extended === undefined) return document;
  if (document.version === 1) throw new Error('Config version 1 does not support extends.');
  if (
    typeof extended !== 'string' ||
    !extended.trim() ||
    path.isAbsolute(extended) ||
    /^[a-z]+:/i.test(extended)
  ) {
    throw new Error('Config extends must be a relative local YAML path.');
  }
  const parentRelative = path.relative(
    root,
    path.resolve(path.dirname(canonicalTarget), extended),
  );
  const base = await loadDocument(root, parentRelative, seen);
  return mergeConfigDocuments(base, document);
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
  const filename = yml ? '.readme-fit.yml' : '.readme-fit.yaml';
  const parsed = await loadDocument(path.resolve(root), filename, new Set());
  return validateConfig(parsed, knownRuleIds);
}

export function resolveReadme(root: string, config: ReadmeFitConfig): string {
  const resolvedRoot = path.resolve(root);
  const resolvedReadme = path.resolve(resolvedRoot, config.readme.path);
  const relative = path.relative(resolvedRoot, resolvedReadme);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('readme.path must resolve inside the repository root.');
  }
  return resolvedReadme;
}
