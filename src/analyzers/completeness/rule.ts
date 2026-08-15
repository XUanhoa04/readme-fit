import type { ProjectType } from '../../models/index.js';
import type { Rule } from '../../rules/types.js';
import { failScore, finding, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

const REQUIRED: Partial<
  Record<ProjectType, Array<{ id: string; label: string; pattern: RegExp; reason: string }>>
> = {
  cli: [
    {
      id: 'installation',
      label: 'Installation',
      pattern: /install|getting started/i,
      reason: 'CLI users need a supported way to obtain the executable.',
    },
    {
      id: 'quick-start',
      label: 'Quick Start',
      pattern: /quick\s*start|usage|get(?:ting)? started/i,
      reason: 'CLI users need a minimal command showing first success.',
    },
  ],
  library: [
    {
      id: 'installation',
      label: 'Installation',
      pattern: /install|get(?:ting)? started/i,
      reason: 'Library adopters need the package installation path.',
    },
    {
      id: 'usage',
      label: 'Usage / Example',
      pattern: /usage|example|quick\s*start/i,
      reason: 'Library adopters need a minimal code example.',
    },
  ],
  'desktop-app': [
    {
      id: 'download',
      label: 'Download / Installation',
      pattern: /download|install|get(?:ting)? started/i,
      reason: 'Desktop users need an install artifact and supported path.',
    },
  ],
  'ai-model': [
    {
      id: 'usage',
      label: 'Usage',
      pattern: /usage|inference|example/i,
      reason: 'Model users need an inference example.',
    },
    {
      id: 'limitations',
      label: 'Limitations',
      pattern: /limitation|risk|known issue/i,
      reason: 'Model limitations are adoption-critical context.',
    },
    {
      id: 'license',
      label: 'License',
      pattern: /license/i,
      reason: 'Model reuse depends on explicit licensing.',
    },
  ],
};

export const completenessRule: Rule = {
  id: 'completeness.project-type',
  category: 'completeness',
  description: 'Checks only high-value sections required by the inferred project type.',
  applies: ({ project }) => Boolean(REQUIRED[project.primaryType]?.length),
  evaluate: ({ readme, project }) => {
    const required = REQUIRED[project.primaryType] ?? [];
    const missing = required.filter(
      (item) => !readme.headings.some((heading) => item.pattern.test(heading.text)),
    );
    const weight = ruleWeight('completeness.project-type', project.primaryType);
    const earned = Math.round(
      (weight * (required.length - missing.length)) / Math.max(required.length, 1),
    );
    return {
      score: missing.length
        ? failScore(
            'completeness.project-type',
            weight,
            earned,
            `${missing.length} important ${project.primaryType} section(s) missing.`,
          )
        : passScore(
            'completeness.project-type',
            weight,
            `All critical ${project.primaryType} sections are represented.`,
          ),
      findings: missing.map((item) =>
        finding({
          id: `completeness.${item.id}.present`,
          category: 'completeness',
          severity: 'high',
          priority: 'P1',
          confidence: 'medium',
          deterministic: false,
          title: `Missing ${item.label}`,
          observation: `No heading representing ${item.label} was detected.`,
          impact: item.reason,
          recommendation: `Add a concise ${item.label} section appropriate for this ${project.primaryType} project.`,
          evidence: [
            { type: 'project-type', message: project.primaryType, value: project },
            {
              type: 'heading-list',
              message: readme.headings.map((heading) => heading.text).join(', '),
              path: readme.path,
              value: readme.headings,
            },
          ],
        }),
      ),
      facts: {
        completeness: {
          required: required.map((item) => item.label),
          missing: missing.map((item) => item.label),
        },
      },
    };
  },
};
