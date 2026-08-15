import pc from 'picocolors';
import type { AnalysisReport, Category, Finding } from '../models/index.js';

const LABELS: Record<Category, string> = {
  correctness: 'Correctness',
  completeness: 'Completeness',
  onboarding: 'Onboarding',
  clarity: 'Clarity',
  impression: 'First Impression',
  'visual-proof': 'Visual Proof',
  trust: 'Trust',
  profile: 'Profile',
};

export interface TerminalRenderOptions {
  verbose?: boolean;
  quiet?: boolean;
}

function scoreLine(label: string, score: number | null): string {
  return `${label.padEnd(22)}${score === null ? 'N/A' : String(score).padStart(3)}`;
}

function renderFinding(finding: Finding): string {
  const source = finding.source?.path
    ? `\n${finding.source.path}${finding.source.line ? `:${finding.source.line}` : ''}`
    : '';
  return [
    `${pc.bold(finding.priority)}  ${pc.bold(finding.title)}${source}`,
    finding.observation,
    finding.impact ? `\nImpact:\n${finding.impact}` : '',
    finding.recommendation ? `\nRecommendation:\n${finding.recommendation}` : '',
    `\nConfidence: ${finding.confidence.toUpperCase()} · ${finding.deterministic ? 'deterministic' : 'heuristic'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function impressionData(report: AnalysisReport): Record<string, unknown> {
  return report.facts.firstImpression && typeof report.facts.firstImpression === 'object'
    ? (report.facts.firstImpression as Record<string, unknown>)
    : {};
}

function impressionMark(impression: Record<string, unknown>, key: string): string {
  return impression[key] === 'yes' ? 'YES' : impression[key] === 'partly' ? 'PARTLY' : 'NO';
}

export function renderImpressionTerminal(report: AnalysisReport): string {
  const impression = impressionData(report);
  const findings = report.findings.filter((finding) => finding.category === 'impression');
  return (
    [
      pc.bold('readme-fit · FIRST 5 SECONDS'),
      `${report.project.primaryType} · ${report.readme.path}`,
      '',
      `Understand WHAT it is?    ${impressionMark(impression, 'what')}`,
      `Understand WHY I need it? ${impressionMark(impression, 'why')}`,
      `See it working?           ${impressionMark(impression, 'proof')}`,
      `Know how to try it?       ${impressionMark(impression, 'try')}`,
      `Trust the project?        ${impressionMark(impression, 'trust')}`,
      '',
      scoreLine('Score', report.scores.impression?.score ?? null),
      '',
      ...(findings.length
        ? [
            pc.bold('IMPRESSION PRIORITIES'),
            '',
            ...findings.flatMap((finding) => [renderFinding(finding), '']),
          ]
        : ['No first-impression findings.', '']),
      'First-impression score is a heuristic based on README structure and content, not actual user testing.',
    ]
      .join('\n')
      .trimEnd() + '\n'
  );
}

export function renderImpressionJson(report: AnalysisReport): string {
  return `${JSON.stringify(
    {
      schemaVersion: report.schemaVersion,
      generatedAt: report.generatedAt,
      project: report.project,
      readme: report.readme,
      score: report.scores.impression ?? null,
      metrics: impressionData(report),
      findings: report.findings.filter((finding) => finding.category === 'impression'),
      disclaimer:
        'First-impression score is a heuristic based on README structure and content, not actual user testing.',
      limitations: report.limitations,
    },
    null,
    2,
  )}\n`;
}

export function renderTerminal(
  report: AnalysisReport,
  options: TerminalRenderOptions = {},
): string {
  if (options.quiet) {
    const critical = report.findings.filter((finding) => finding.severity === 'critical');
    return (
      [
        `readme-fit ${report.overall}/100`,
        ...critical.map(
          (finding) =>
            `${finding.priority} ${finding.title}${finding.source?.path ? ` (${finding.source.path}${finding.source.line ? `:${finding.source.line}` : ''})` : ''}`,
        ),
      ].join('\n') + '\n'
    );
  }

  const projectTypes = [report.project.primaryType, ...report.project.secondaryTypes].join(
    ' / ',
  );
  const fileCount = typeof report.facts.fileCount === 'number' ? report.facts.fileCount : 0;
  const scoreLines = Object.entries(report.scores).map(([category, score]) =>
    scoreLine(LABELS[category as Category], score?.score ?? null),
  );
  const top = report.findings.filter((finding) => finding.severity !== 'info').slice(0, 6);
  const impression = impressionData(report);
  const verboseRules = options.verbose
    ? [
        pc.bold('RULE RESULTS'),
        '',
        ...Object.values(report.scores).flatMap((score) =>
          score
            ? score.rules.map(
                (rule) =>
                  `${rule.status.toUpperCase().padEnd(15)} ${rule.id.padEnd(42)} ${rule.earned}/${rule.weight}  ${rule.explanation}`,
              )
            : [],
        ),
        '',
      ]
    : [];

  return (
    [
      pc.bold('readme-fit'),
      'Does your README fit what you built?',
      '',
      pc.bold('PROJECT'),
      '',
      `Type        ${projectTypes}`,
      `README      ${report.readme.path}`,
      `Files       ${String(fileCount)}`,
      `Language    ${report.project.languages.join(', ') || 'Unknown'}`,
      '',
      pc.bold('README FIT'),
      '',
      ...scoreLines,
      '',
      scoreLine('Overall', report.overall),
      '',
      pc.bold('TOP PRIORITIES'),
      '',
      ...(top.length
        ? top.flatMap((finding) => [renderFinding(finding), ''])
        : ['No high-priority findings.', '']),
      pc.bold('FIRST 5 SECONDS'),
      '',
      `Understand WHAT it is?    ${impressionMark(impression, 'what')}`,
      `Understand WHY I need it? ${impressionMark(impression, 'why')}`,
      `See it working?           ${impressionMark(impression, 'proof')}`,
      `Know how to try it?       ${impressionMark(impression, 'try')}`,
      `Trust the project?        ${impressionMark(impression, 'trust')}`,
      '',
      scoreLine('Score', report.scores.impression?.score ?? null),
      '',
      'First-impression score is a heuristic based on README structure and content, not actual user testing.',
      '',
      ...verboseRules,
      pc.bold('VERIFICATION COVERAGE'),
      '',
      ...report.coverage.verified.map((item) => `✓ ${item}`),
      ...report.coverage.inferred.map((item) => `~ ${item}`),
      ...report.coverage.notChecked.map((item) => `– ${item}`),
      '',
      ...report.limitations.map((item) => `Limitation: ${item}`),
    ]
      .join('\n')
      .trimEnd() + '\n'
  );
}
