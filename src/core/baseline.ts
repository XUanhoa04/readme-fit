import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type {
  AnalysisReport,
  BaselineComparison,
  BaselineFile,
  BaselineFinding,
  Category,
  Finding,
} from '../models/index.js';

export function findingFingerprint(finding: Finding): string {
  const identity = [finding.id, finding.source?.path ?? '', finding.title].join('\0');
  return createHash('sha256').update(identity).digest('hex').slice(0, 16);
}

export function createBaseline(report: AnalysisReport): BaselineFile {
  return {
    schemaVersion: 1,
    createdAt: report.generatedAt,
    projectType: report.project.primaryType,
    scores: Object.fromEntries(
      Object.entries(report.scores).map(([category, score]) => [
        category,
        score?.score ?? null,
      ]),
    ),
    findings: report.findings.map((finding): BaselineFinding => {
      const baseline: BaselineFinding = {
        fingerprint: findingFingerprint(finding),
        id: finding.id,
        title: finding.title,
        category: finding.category,
        severity: finding.severity,
      };
      if (finding.source?.path) baseline.path = finding.source.path;
      return baseline;
    }),
  };
}

function isBaselineFinding(value: unknown): value is BaselineFinding {
  if (!value || typeof value !== 'object') return false;
  const finding = value as Record<string, unknown>;
  return (
    typeof finding.fingerprint === 'string' &&
    typeof finding.id === 'string' &&
    typeof finding.title === 'string' &&
    typeof finding.category === 'string' &&
    typeof finding.severity === 'string'
  );
}

export function parseBaseline(raw: string): BaselineFile {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Baseline is not valid JSON.');
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid baseline document.');
  const baseline = value as Record<string, unknown>;
  if (
    baseline.schemaVersion !== 1 ||
    typeof baseline.createdAt !== 'string' ||
    typeof baseline.projectType !== 'string' ||
    !baseline.scores ||
    typeof baseline.scores !== 'object' ||
    !Array.isArray(baseline.findings) ||
    !baseline.findings.every(isBaselineFinding)
  ) {
    throw new Error('Invalid or unsupported readme-fit baseline schema.');
  }
  return value as BaselineFile;
}

export async function loadBaseline(filePath: string): Promise<BaselineFile> {
  try {
    return parseBaseline(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error instanceof Error && /baseline/i.test(error.message)) throw error;
    throw new Error(`Baseline not found: ${filePath}`);
  }
}

export function compareBaseline(
  report: AnalysisReport,
  baseline: BaselineFile,
): BaselineComparison {
  const previous = new Map(
    baseline.findings.map((finding) => [finding.fingerprint, finding] as const),
  );
  const current = new Map(
    report.findings.map((finding) => [findingFingerprint(finding), finding] as const),
  );
  const newFindings = [...current.entries()]
    .filter(([fingerprint]) => !previous.has(fingerprint))
    .map(([, finding]) => finding);
  const resolvedFindings = [...previous.entries()]
    .filter(([fingerprint]) => !current.has(fingerprint))
    .map(([, finding]) => finding);
  const scoreDeltas: BaselineComparison['scoreDeltas'] = {};
  for (const [category, score] of Object.entries(report.scores)) {
    const key = category as Category;
    const currentScore = score?.score ?? null;
    const previousScore = baseline.scores[key];
    scoreDeltas[key] =
      currentScore === null || previousScore === null || previousScore === undefined
        ? null
        : currentScore - previousScore;
  }
  return {
    schemaVersion: 1,
    newFindings,
    resolvedFindings,
    unchangedFindings: report.findings.length - newFindings.length,
    scoreDeltas,
  };
}
