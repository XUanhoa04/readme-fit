import pc from 'picocolors';
import type { ProfileCategory, ProfileReport } from '../models/index.js';

const LABELS: Record<ProfileCategory, string> = {
  positioning: 'Positioning', 'proof-of-work': 'Proof of Work', 'project-selection': 'Project Selection',
  scanability: 'Scanability', 'technical-narrative': 'Technical Narrative', contact: 'Contact',
};

export function renderProfileTerminal(report: ProfileReport): string {
  const themes = Array.isArray(report.facts.visibleRepositoryThemes) ? report.facts.visibleRepositoryThemes as Array<{ theme: string; repositories: number }> : [];
  return [
    pc.bold('readme-fit profile'),
    'Public evidence, not a judgment of human ability.',
    '',
    `${report.user.name ?? report.user.login} · ${report.user.url}`,
    '',
    pc.bold('PROFILE FIT'),
    '',
    ...Object.entries(report.scores).map(([category, score]) => `${LABELS[category as ProfileCategory].padEnd(22)}${`${score.score}/${score.maxScore}`.padStart(6)}`),
    '',
    `${'Total'.padEnd(22)}${`${report.total}/100`.padStart(6)}`,
    '',
    pc.bold('VISIBLE REPOSITORY THEMES'),
    '',
    ...(themes.length ? themes.map((theme) => `${theme.theme.padEnd(24)}${theme.repositories}`) : ['No recurring non-language themes detected.']),
    '',
    pc.bold('PRIORITIES'),
    '',
    ...(report.findings.length ? report.findings.flatMap((item) => [
      `${pc.bold(item.priority)}  ${pc.bold(item.title)}`,
      item.observation,
      item.recommendation ? `Recommendation: ${item.recommendation}` : '',
      '',
    ]) : ['No high-priority deterministic profile findings.', '']),
    report.disclaimer,
    '',
    ...report.limitations.map((item) => `Limitation: ${item}`),
  ].filter((line) => line !== '').join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
