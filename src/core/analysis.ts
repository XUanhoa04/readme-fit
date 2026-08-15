import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, resolveReadme } from './config/config.js';
import { parseReadme } from './markdown/parser.js';
import { inspectRepository } from './repository/inspector.js';
import type { AnalysisReport, CategoryScore, ProjectProfile } from '../models/index.js';
import { getRules } from '../rules/registry.js';
import { classifyProject } from '../classifiers/project-type/classifier.js';
import '../rules/builtin.js';

export async function analyzeRepository(rootInput: string): Promise<AnalysisReport> {
  const root = path.resolve(rootInput);
  const config = await loadConfig(root);
  const repository = await inspectRepository(root);
  const readmePath = resolveReadme(root, config);
  let raw: string;
  try {
    raw = await readFile(readmePath, 'utf8');
  } catch {
    throw new Error(`README not found: ${path.relative(root, readmePath)}`);
  }
  const readme = parseReadme(raw, path.relative(root, readmePath).replaceAll('\\', '/'));
  const project: ProjectProfile = classifyProject(repository, config.project.type);
  const context = { repository, readme, project, config };
  const findings = [];
  const scores: AnalysisReport['scores'] = {};
  const facts: Record<string, unknown> = { fileCount: repository.files.length };
  for (const rule of getRules()) {
    if (config.ignore.rules.includes(rule.id) || !rule.applies(context)) continue;
    const result = await rule.evaluate(context);
    findings.push(...result.findings);
    Object.assign(facts, result.facts);
    const category = rule.category;
    const existing = scores[category] ?? { category, score: 0, maxScore: 100, rules: [] } satisfies CategoryScore;
    existing.rules.push(result.score);
    scores[category] = existing;
  }
  for (const score of Object.values(scores)) {
    if (!score) continue;
    const applicable = score.rules.filter((rule) => rule.status !== 'not_applicable');
    const max = applicable.reduce((sum, rule) => sum + rule.weight, 0);
    score.score = max ? Math.round(applicable.reduce((sum, rule) => sum + rule.earned, 0) / max * 100) : null;
  }
  const impressionFacts: Record<string, unknown> = {};
  for (const key of ['impression.what', 'impression.why', 'impression.proof', 'impression.try', 'impression.trust']) {
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
    overall: numeric.length ? Math.round(numeric.reduce((sum, score) => sum + score, 0) / numeric.length) : 0,
    findings: findings.sort((a, b) => ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity)),
    facts,
    coverage: {
      verified: ['README structure parsed with a Markdown AST', 'repository metadata inspected statically'],
      inferred: ['project type'],
      notChecked: ['external URL health', 'commands were not executed', 'demo/video content'],
    },
    limitations: [
      'Static analysis does not prove that documented commands succeed at runtime.',
      'External URLs and linked media content are not fetched by default.',
    ],
  };
}
