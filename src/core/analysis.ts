import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, resolveReadme } from './config/config.js';
import { parseReadme } from './markdown/parser.js';
import { inspectRepository, MAX_INSPECTED_TEXT_BYTES } from './repository/inspector.js';
import type { AnalysisReport, CategoryScore, ProjectProfile } from '../models/index.js';
import { classifyProject } from '../classifiers/project-type/classifier.js';
import { createBuiltinRules } from '../rules/builtin.js';
import type { Rule } from '../rules/types.js';
import { normalizeRuleScore } from '../rules/helpers.js';
import { buildEvidenceGraph } from './evidence/graph.js';
import { categoryWeight } from '../scoring/weights.js';

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export interface AnalysisOptions {
  checkLinks?: boolean;
  projectPath?: string;
  readmePath?: string;
}

export async function analyzeRepository(
  rootInput: string,
  options: AnalysisOptions = {},
  rules: readonly Rule[] = createBuiltinRules(),
): Promise<AnalysisReport> {
  const repositoryRoot = path.resolve(rootInput);
  const root = options.projectPath
    ? path.resolve(repositoryRoot, options.projectPath)
    : repositoryRoot;
  if (!isInside(repositoryRoot, root)) {
    throw new Error('projectPath must resolve inside the repository root.');
  }
  const [canonicalRepositoryRoot, canonicalProjectRoot] = await Promise.all([
    realpath(repositoryRoot),
    realpath(root),
  ]);
  if (!isInside(canonicalRepositoryRoot, canonicalProjectRoot)) {
    throw new Error('projectPath must resolve inside the repository root.');
  }
  const config = await loadConfig(root, new Set(rules.map((rule) => rule.id)));
  if (options.readmePath !== undefined) {
    if (!options.readmePath.trim()) throw new Error('readmePath must not be empty.');
    config.readme.path = options.readmePath;
  }
  const repository = await inspectRepository(root, config.ignore.paths);
  const readmePath = resolveReadme(root, config);
  let raw: string;
  try {
    const metadata = await stat(readmePath);
    if (metadata.size > MAX_INSPECTED_TEXT_BYTES) {
      throw new Error(
        `${path.relative(root, readmePath)} exceeds the ${MAX_INSPECTED_TEXT_BYTES}-byte static inspection limit.`,
      );
    }
    const [canonicalRoot, canonicalReadme] = await Promise.all([
      realpath(root),
      realpath(readmePath),
    ]);
    if (!isInside(canonicalRoot, canonicalReadme)) {
      throw new Error('Configured README resolves outside the repository root.');
    }
    raw = await readFile(canonicalReadme, 'utf8');
  } catch (error) {
    if (
      error instanceof Error &&
      /static inspection limit|outside the repository root/.test(error.message)
    )
      throw error;
    throw new Error(`README not found: ${path.relative(root, readmePath)}`);
  }
  const readme = parseReadme(raw, path.relative(root, readmePath).replaceAll('\\', '/'));
  const project: ProjectProfile = classifyProject(repository, config.project.type);
  const evidenceGraph = buildEvidenceGraph(repository, readme);
  const context = {
    repository,
    readme,
    project,
    config,
    options: { checkLinks: Boolean(options.checkLinks) },
    evidenceGraph,
  };
  const findings = [];
  const scores: AnalysisReport['scores'] = {};
  const facts: Record<string, unknown> = {
    fileCount: repository.files.length,
    repositoryInspection: repository.inspection,
    workspace: repository.workspace,
    projectPath: options.projectPath?.replaceAll('\\', '/').replace(/\/$/, '') || '.',
  };
  for (const rule of rules) {
    const configKey =
      rule.category === 'visual-proof'
        ? 'visual_proof'
        : rule.category === 'impression'
          ? 'first_impression'
          : rule.category;
    if (
      config.rules[configKey] === false ||
      config.ruleOverrides[rule.id]?.enabled === false ||
      config.ignore.rules.includes(rule.id) ||
      !rule.applies(context)
    )
      continue;
    const result = await rule.evaluate(context);
    findings.push(...result.findings);
    for (const [key, value] of Object.entries(result.facts ?? {})) {
      if (key in facts) throw new Error(`Duplicate analysis fact key: ${key}`);
      facts[key] = value;
    }
    const category = rule.category;
    const existing =
      scores[category] ??
      ({
        category,
        score: 0,
        maxScore: 100,
        weight: categoryWeight(category, project.primaryType, config.scoring.preset),
        coverage: 0,
        rules: [],
      } satisfies CategoryScore);
    const normalized = normalizeRuleScore(result.score);
    const overrideWeight = config.ruleOverrides[rule.id]?.weight;
    existing.rules.push(
      overrideWeight === undefined || normalized.status === 'not_applicable'
        ? normalized
        : {
            ...normalized,
            weight: overrideWeight,
            earned: normalized.weight
              ? Math.round((normalized.earned / normalized.weight) * overrideWeight)
              : 0,
          },
    );
    scores[category] = existing;
  }
  for (const score of Object.values(scores)) {
    if (!score) continue;
    const applicable = score.rules.filter((rule) => rule.status !== 'not_applicable');
    const max = applicable.reduce((sum, rule) => sum + rule.weight, 0);
    score.score = max
      ? Math.round((applicable.reduce((sum, rule) => sum + rule.earned, 0) / max) * 100)
      : null;
    score.coverage = score.score === null ? 0 : 100;
  }
  const impressionFacts: Record<string, unknown> = {};
  for (const key of [
    'impression.what',
    'impression.why',
    'impression.proof',
    'impression.try',
    'impression.trust',
  ]) {
    if (key in facts) impressionFacts[key.split('.')[1] ?? key] = facts[key];
  }
  facts.firstImpression = impressionFacts;
  const coveredScores = Object.values(scores).filter((score): score is CategoryScore =>
    Boolean(score && score.score !== null && score.weight > 0),
  );
  const configuredCategoryWeight = Object.values(scores).reduce(
    (sum, score) => sum + (score?.weight ?? 0),
    0,
  );
  const coveredCategoryWeight = coveredScores.reduce((sum, score) => sum + score.weight, 0);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    project,
    readme: { path: readme.path, lines: readme.lineCount, words: readme.wordCount },
    scores,
    overall: coveredCategoryWeight
      ? Math.round(
          coveredScores.reduce((sum, score) => sum + (score.score ?? 0) * score.weight, 0) /
            coveredCategoryWeight,
        )
      : 0,
    overallCoverage: configuredCategoryWeight
      ? Math.round((coveredCategoryWeight / configuredCategoryWeight) * 100)
      : 0,
    findings: findings.sort((a, b) => {
      const severityDiff =
        ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) -
        ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity);
      if (severityDiff !== 0) return severityDiff;

      const priorityDiff =
        ['P0', 'P1', 'P2', 'P3'].indexOf(a.priority) -
        ['P0', 'P1', 'P2', 'P3'].indexOf(b.priority);
      if (priorityDiff !== 0) return priorityDiff;

      const pathA = a.source?.path ?? '';
      const pathB = b.source?.path ?? '';
      const pathDiff = pathA.localeCompare(pathB);
      if (pathDiff !== 0) return pathDiff;

      const lineA = a.source?.line ?? 0;
      const lineB = b.source?.line ?? 0;
      if (lineA !== lineB) return lineA - lineB;

      return a.id.localeCompare(b.id);
    }),
    facts,
    coverage: {
      verified: [
        'README structure parsed with a Markdown AST',
        'repository metadata inspected statically',
        ...(options.checkLinks ? ['external URL responses checked'] : []),
      ],
      inferred: ['project type'],
      notChecked: [
        ...(!options.checkLinks ? ['external URL health'] : []),
        'commands were not executed',
        'demo/video content',
        ...(repository.inspection.truncated
          ? [`files beyond the ${repository.inspection.fileLimit}-file inspection limit`]
          : []),
      ],
    },
    limitations: [
      'Static analysis does not prove that documented commands succeed at runtime.',
      options.checkLinks
        ? 'External URL responses were checked, but linked content quality was not analyzed.'
        : 'External URLs and linked media content are not fetched by default.',
      ...(repository.inspection.truncated
        ? [
            `Repository inspection stopped at ${repository.inspection.fileLimit} files; classification and evidence may be incomplete.`,
          ]
        : []),
      ...(project.rubricStatus !== 'stable'
        ? [
            `${project.primaryType} classification is supported, but its completeness rubric is ${project.rubricStatus}.`,
          ]
        : []),
    ],
    evidenceGraph,
  };
}
