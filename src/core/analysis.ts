import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, resolveReadme } from './config/config.js';
import { parseReadme } from './markdown/parser.js';
import {
  inspectRepository,
  MAX_INSPECTED_TEXT_BYTES,
} from './repository/inspector.js';
import type { AnalysisReport, CategoryScore, ProjectProfile } from '../models/index.js';
import { getRules } from '../rules/registry.js';
import { classifyProject } from '../classifiers/project-type/classifier.js';
import '../rules/builtin.js';

export interface AnalysisOptions {
  checkLinks?: boolean;
}

export async function analyzeRepository(
  rootInput: string,
  options: AnalysisOptions = {},
): Promise<AnalysisReport> {
  const root = path.resolve(rootInput);
  const config = await loadConfig(root, new Set(getRules().map((rule) => rule.id)));
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
    raw = await readFile(readmePath, 'utf8');
  } catch (error) {
    if (error instanceof Error && /static inspection limit/.test(error.message)) throw error;
    throw new Error(`README not found: ${path.relative(root, readmePath)}`);
  }
  const readme = parseReadme(raw, path.relative(root, readmePath).replaceAll('\\', '/'));
  const project: ProjectProfile = classifyProject(repository, config.project.type);
  const context = {
    repository,
    readme,
    project,
    config,
    options: { checkLinks: Boolean(options.checkLinks) },
  };
  const findings = [];
  const scores: AnalysisReport['scores'] = {};
  const facts: Record<string, unknown> = { fileCount: repository.files.length };
  for (const rule of getRules()) {
    const configKey =
      rule.category === 'visual-proof'
        ? 'visual_proof'
        : rule.category === 'impression'
          ? 'first_impression'
          : rule.category;
    if (
      config.rules[configKey] === false ||
      config.ignore.rules.includes(rule.id) ||
      !rule.applies(context)
    )
      continue;
    const result = await rule.evaluate(context);
    findings.push(...result.findings);
    Object.assign(facts, result.facts);
    const category = rule.category;
    const existing =
      scores[category] ??
      ({ category, score: 0, maxScore: 100, rules: [] } satisfies CategoryScore);
    existing.rules.push(result.score);
    scores[category] = existing;
  }
  for (const score of Object.values(scores)) {
    if (!score) continue;
    const applicable = score.rules.filter((rule) => rule.status !== 'not_applicable');
    const max = applicable.reduce((sum, rule) => sum + rule.weight, 0);
    score.score = max
      ? Math.round((applicable.reduce((sum, rule) => sum + rule.earned, 0) / max) * 100)
      : null;
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
  const numeric = Object.values(scores).flatMap((score) => score?.score ?? []);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project,
    readme: { path: readme.path, lines: readme.lineCount, words: readme.wordCount },
    scores,
    overall: numeric.length
      ? Math.round(numeric.reduce((sum, score) => sum + score, 0) / numeric.length)
      : 0,
    findings: findings.sort(
      (a, b) =>
        ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) -
        ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity),
    ),
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
      ],
    },
    limitations: [
      'Static analysis does not prove that documented commands succeed at runtime.',
      options.checkLinks
        ? 'External URL responses were checked, but linked content quality was not analyzed.'
        : 'External URLs and linked media content are not fetched by default.',
    ],
  };
}
