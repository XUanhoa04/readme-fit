import pc from 'picocolors';
import type { AnalysisReport, Category, Finding } from '../models/index.js';

const LABELS: Record<Category, string> = {
  correctness: 'Correctness', completeness: 'Completeness', onboarding: 'Onboarding',
  clarity: 'Clarity', impression: 'First Impression', 'visual-proof': 'Visual Proof',
  trust: 'Trust', profile: 'Profile',
};

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
  ].filter(Boolean).join('\n');
}

export function renderTerminal(report: AnalysisReport): string {
  const projectTypes = [report.project.primaryType, ...report.project.secondaryTypes].join(' / ');
  const fileCount = typeof report.facts.fileCount === 'number' ? report.facts.fileCount : 0;
  const scoreLines = Object.entries(report.scores).map(([category, score]) =>
    scoreLine(LABELS[category as Category], score?.score ?? null),
  );
  const top = report.findings.filter((finding) => finding.severity !== 'info').slice(0, 6);
  const impression = report.facts.firstImpression && typeof report.facts.firstImpression === 'object'
    ? report.facts.firstImpression as Record<string, unknown>
    : {};
  const impressionScore = report.scores.impression?.score ?? null;
  const mark = (key: string) => impression[key] === 'yes' ? 'YES' : impression[key] === 'partly' ? 'PARTLY' : 'NO';
  return [
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
    ...(top.length ? top.flatMap((finding) => [renderFinding(finding), '']) : ['No high-priority findings.', '']),
    pc.bold('FIRST 5 SECONDS'),
    '',
    `Understand WHAT it is?    ${mark('what')}`,
    `Understand WHY I need it? ${mark('why')}`,
    `See it working?           ${mark('proof')}`,
    `Know how to try it?       ${mark('try')}`,
    `Trust the project?        ${mark('trust')}`,
    '',
    scoreLine('Score', impressionScore),
    '',
    'First-impression score is a heuristic based on README structure and content, not actual user testing.',
    '',
    pc.bold('VERIFICATION COVERAGE'),
    '',
    ...report.coverage.verified.map((item) => `✓ ${item}`),
    ...report.coverage.inferred.map((item) => `~ ${item}`),
    ...report.coverage.notChecked.map((item) => `– ${item}`),
    '',
    ...report.limitations.map((item) => `Limitation: ${item}`),
  ].join('\n').trimEnd() + '\n';
}
