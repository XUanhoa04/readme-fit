import type { AnalysisReport, Finding } from '../models/index.js';
import { reportFindings } from '../core/git-diff.js';

function escapeMessage(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeProperty(value: string): string {
  return escapeMessage(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

function command(finding: Finding, fallbackPath: string, projectPath: string): string {
  const level =
    finding.severity === 'critical' || finding.severity === 'high'
      ? 'error'
      : finding.severity === 'medium'
        ? 'warning'
        : 'notice';
  const source = finding.source?.path ?? fallbackPath;
  const path = projectPath && projectPath !== '.' ? `${projectPath}/${source}` : source;
  const properties = [
    `file=${escapeProperty(path)}`,
    `line=${Math.max(1, finding.source?.line ?? 1)}`,
    `title=${escapeProperty(`${finding.priority} ${finding.title}`)}`,
  ].join(',');
  const message = [finding.observation, finding.recommendation].filter(Boolean).join(' ');
  return `::${level} ${properties}::${escapeMessage(message)}`;
}

export function renderGitHub(report: AnalysisReport, maximum = Infinity): string {
  const projectPath =
    typeof report.facts.projectPath === 'string' ? report.facts.projectPath : '.';
  const output = reportFindings(report)
    .slice(0, maximum)
    .map((finding) => command(finding, report.readme.path, projectPath));
  output.push(
    `readme-fit score=${report.overall}/100 coverage=${report.overallCoverage}% findings=${reportFindings(report).length}`,
  );
  return `${output.join('\n')}\n`;
}
