import type { AnalysisReport, Finding, Severity } from '../models/index.js';
import { reportFindings } from '../core/git-diff.js';
import { VERSION } from '../version.js';

function level(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

function ruleDescriptor(finding: Finding) {
  return {
    id: finding.id,
    name: finding.title,
    shortDescription: { text: finding.title },
    fullDescription: { text: finding.impact ?? finding.observation },
    help: {
      text: finding.recommendation ?? finding.observation,
      markdown: finding.recommendation ?? finding.observation,
    },
    properties: { category: finding.category, priority: finding.priority },
  };
}

function sourcePath(report: AnalysisReport, finding: Finding): string {
  const source = (finding.source?.path ?? report.readme.path).replaceAll('\\', '/');
  const prefix =
    typeof report.facts.projectPath === 'string' ? report.facts.projectPath : '.';
  return prefix && prefix !== '.' ? `${prefix}/${source}` : source;
}

export function renderSarif(report: AnalysisReport, maximum = Infinity): string {
  const findings = reportFindings(report).slice(0, maximum);
  const rules = [
    ...new Map(findings.map((finding) => [finding.id, ruleDescriptor(finding)])).values(),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const ruleIndexes = new Map(rules.map((rule, index) => [rule.id, index]));
  return `${JSON.stringify(
    {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'readme-fit',
              semanticVersion: VERSION,
              informationUri: 'https://github.com/XUanhoa04/readme-fit',
              rules,
            },
          },
          automationDetails: { id: `readme-fit/${report.project.primaryType}` },
          results: findings.map((finding) => ({
            ruleId: finding.id,
            ruleIndex: ruleIndexes.get(finding.id),
            level: level(finding.severity),
            message: {
              text: [finding.observation, finding.recommendation].filter(Boolean).join(' '),
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: sourcePath(report, finding),
                  },
                  region: { startLine: Math.max(1, finding.source?.line ?? 1) },
                },
              },
            ],
            partialFingerprints: { readmeFitFinding: `${finding.id}:${finding.title}` },
            properties: {
              category: finding.category,
              priority: finding.priority,
              confidence: finding.confidence,
              deterministic: finding.deterministic,
            },
          })),
        },
      ],
    },
    null,
    2,
  )}\n`;
}
