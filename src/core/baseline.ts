import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type {
  AnalysisReport,
  BaselineComparison,
  BaselineFile,
  BaselineFinding,
  Category,
  Finding,
  Severity,
} from '../models/index.js';

interface LegacyBaselineFile {
  schemaVersion: 1;
  createdAt: string;
  projectType: string;
  scores: Record<string, number | null>;
  findings: Array<Omit<BaselineFinding, 'subject'>>;
}

const CATEGORIES = new Set<Category>([
  'correctness',
  'completeness',
  'onboarding',
  'clarity',
  'impression',
  'visual-proof',
  'trust',
  'profile',
]);
const SEVERITIES = new Set<Severity>(['critical', 'high', 'medium', 'low', 'info']);

function digest(identity: string): string {
  return createHash('sha256').update(identity).digest('hex').slice(0, 16);
}

function canonicalValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`)
    .join(',')}}`;
}

export function findingSubject(finding: Finding): string {
  const evidence = finding.evidence[0];
  if (!evidence) return finding.title;
  const value =
    evidence.value === undefined ? evidence.message : canonicalValue(evidence.value);
  return [evidence.type, evidence.path ?? '', String(value).trim()].join('\0');
}

function legacyFindingFingerprint(finding: Finding): string {
  return digest([finding.id, finding.source?.path ?? '', finding.title].join('\0'));
}

export function findingFingerprint(finding: Finding): string {
  return digest(
    [finding.id, finding.source?.path ?? '', finding.title, findingSubject(finding)].join(
      '\0',
    ),
  );
}

export function createBaseline(report: AnalysisReport): BaselineFile {
  return {
    schemaVersion: 2,
    fingerprintVersion: 2,
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
        subject: findingSubject(finding),
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

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isBaselineFinding(value: unknown, requireSubject: boolean): boolean {
  const item = record(value);
  return Boolean(
    item &&
    typeof item.fingerprint === 'string' &&
    (!requireSubject || typeof item.subject === 'string') &&
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.category === 'string' &&
    CATEGORIES.has(item.category as Category) &&
    typeof item.severity === 'string' &&
    SEVERITIES.has(item.severity as Severity) &&
    (item.path === undefined || typeof item.path === 'string'),
  );
}

function validScores(value: unknown): value is Record<string, number | null> {
  const scores = record(value);
  return Boolean(
    scores &&
    Object.entries(scores).every(
      ([category, score]) =>
        CATEGORIES.has(category as Category) &&
        (score === null ||
          (typeof score === 'number' &&
            Number.isInteger(score) &&
            score >= 0 &&
            score <= 100)),
    ),
  );
}

function sharedBaselineFields(
  value: Record<string, unknown>,
  requireSubject: boolean,
): boolean {
  return (
    typeof value.createdAt === 'string' &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    typeof value.projectType === 'string' &&
    validScores(value.scores) &&
    Array.isArray(value.findings) &&
    value.findings.every((finding) => isBaselineFinding(finding, requireSubject))
  );
}

export function parseBaseline(raw: string): BaselineFile {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Baseline is not valid JSON.');
  }
  const baseline = record(value);
  if (!baseline) throw new Error('Invalid baseline document.');

  if (
    baseline.schemaVersion === 2 &&
    baseline.fingerprintVersion === 2 &&
    sharedBaselineFields(baseline, true)
  ) {
    return value as BaselineFile;
  }

  if (baseline.schemaVersion === 1 && sharedBaselineFields(baseline, false)) {
    const legacy = value as LegacyBaselineFile;
    return {
      schemaVersion: 2,
      fingerprintVersion: 1,
      createdAt: legacy.createdAt,
      projectType: legacy.projectType as BaselineFile['projectType'],
      scores: legacy.scores,
      findings: legacy.findings.map((finding) => ({ ...finding, subject: finding.title })),
    };
  }

  throw new Error('Invalid or unsupported readme-fit baseline schema.');
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
  const currentIdentity = (finding: Finding): string =>
    baseline.fingerprintVersion === 1
      ? legacyFindingFingerprint(finding)
      : findingFingerprint(finding);
  const previousFingerprints = new Set(
    baseline.findings.map((finding) => finding.fingerprint),
  );
  const currentFingerprints = new Set(report.findings.map(currentIdentity));
  const newFindings = report.findings.filter(
    (finding) => !previousFingerprints.has(currentIdentity(finding)),
  );
  const resolvedFindings = baseline.findings.filter(
    (finding) => !currentFingerprints.has(finding.fingerprint),
  );
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
    schemaVersion: 2,
    newFindings,
    resolvedFindings,
    unchangedFindings: report.findings.length - newFindings.length,
    scoreDeltas,
  };
}
