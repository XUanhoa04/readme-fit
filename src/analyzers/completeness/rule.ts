import type { ProjectType, ReadmeDocument, ReadmeSection } from '../../models/index.js';
import type { Rule } from '../../rules/types.js';
import { failScore, finding, partialScore, passScore } from '../../rules/helpers.js';
import { ruleWeight, STABLE_PROJECT_TYPES } from '../../scoring/weights.js';
import { runnableCommands } from '../onboarding/facts.js';

interface RequirementResult {
  id: string;
  label: string;
  reason: string;
  present: boolean;
  observation: string;
  section?: ReadmeSection;
}

function section(readme: ReadmeDocument, pattern: RegExp): ReadmeSection | undefined {
  return readme.sections.find(
    (item) => item.heading.depth >= 2 && pattern.test(item.heading.text),
  );
}

function commandsIn(readme: ReadmeDocument, target: ReadmeSection | undefined) {
  if (!target) return [];
  return runnableCommands(readme).filter(
    (command) => command.line >= target.heading.line && command.line <= target.endLine,
  );
}

function codeExampleIn(readme: ReadmeDocument, target: ReadmeSection | undefined): boolean {
  if (!target) return false;
  return readme.codeBlocks.some(
    (block) =>
      block.line >= target.heading.line &&
      block.line <= target.endLine &&
      /^(?:js|jsx|ts|tsx|javascript|typescript|py|python|rs|rust|go|java|rb|ruby|php|cs|csharp)$/i.test(
        block.language ?? '',
      ) &&
      block.value.trim().split(/\s+/).length >= 3,
  );
}

function sectionRequirement(
  readme: ReadmeDocument,
  id: string,
  label: string,
  pattern: RegExp,
  reason: string,
  minimumWords: number,
): RequirementResult {
  const found = section(readme, pattern);
  const present = Boolean(found && found.wordCount >= minimumWords);
  return {
    id,
    label,
    reason,
    present,
    observation: present
      ? `${label} contains ${found?.wordCount ?? 0} prose word(s).`
      : !found
        ? `No heading representing ${label} was detected.`
        : `${label} exists but contains only ${found.wordCount} prose word(s); at least ${minimumWords} are needed for substantive coverage.`,
    ...(found ? { section: found } : {}),
  };
}

function requirements(type: ProjectType, readme: ReadmeDocument): RequirementResult[] {
  if (type === 'cli') {
    const onboarding = section(readme, /quick\s*start|install|get(?:ting)? started|usage/i);
    const commands = commandsIn(readme, onboarding);
    const installation = commands.some(
      (command) => command.kind === 'install' || /^npx\b/i.test(command.command),
    );
    const firstSuccess = commands.some((command) => command.kind === 'usage');
    return [
      {
        id: 'installation',
        label: 'Installation',
        reason: 'CLI users need a supported way to obtain or invoke the executable.',
        present: installation,
        observation: installation
          ? 'A supported install or direct invocation command appears in onboarding.'
          : onboarding
            ? 'An onboarding heading exists, but it contains no install command or directly runnable npx command.'
            : 'No onboarding section with an install or direct npx path was detected.',
        ...(onboarding ? { section: onboarding } : {}),
      },
      {
        id: 'quick-start',
        label: 'Quick Start',
        reason: 'CLI users need a minimal usage command showing first success.',
        present: Boolean(onboarding && firstSuccess),
        observation:
          onboarding && firstSuccess
            ? 'A first-success usage command appears in onboarding.'
            : onboarding
              ? 'An onboarding heading exists, but it contains no first-success usage command.'
              : 'No Quick Start, Usage, or Getting Started section was detected.',
        ...(onboarding ? { section: onboarding } : {}),
      },
    ];
  }
  if (type === 'library' || type === 'sdk') {
    const install = section(readme, /install|get(?:ting)? started/i);
    const usage = section(readme, /usage|example|quick\s*start/i);
    return [
      {
        id: 'installation',
        label: 'Installation',
        reason: 'Library adopters need the package installation path.',
        present: commandsIn(readme, install).some((command) => command.kind === 'install'),
        observation: commandsIn(readme, install).some(
          (command) => command.kind === 'install',
        )
          ? 'A recognized package-install command appears in the Installation section.'
          : install
            ? 'The Installation section has no recognized package-install command.'
            : 'No Installation or Getting Started section was detected.',
        ...(install ? { section: install } : {}),
      },
      {
        id: 'usage',
        label: 'Usage / Example',
        reason: 'Library adopters need a substantive minimal code example.',
        present: codeExampleIn(readme, usage),
        observation: codeExampleIn(readme, usage)
          ? 'A substantive language-tagged code example appears in Usage.'
          : usage
            ? 'The Usage or Example section has no substantive language-tagged code example.'
            : 'No Usage, Example, or Quick Start section was detected.',
        ...(usage ? { section: usage } : {}),
      },
    ];
  }
  if (type === 'desktop-app') {
    return [
      sectionRequirement(
        readme,
        'download',
        'Download / Installation',
        /download|install|get(?:ting)? started/i,
        'Desktop users need an install artifact and supported path.',
        5,
      ),
    ];
  }
  if (type === 'web-app') {
    const setup = section(
      readme,
      /quick\s*start|install|get(?:ting)? started|local|development/i,
    );
    const runnable = commandsIn(readme, setup).some((command) => command.kind === 'usage');
    return [
      {
        id: 'local-run',
        label: 'Local run path',
        reason:
          'Web application adopters need a concrete path to a running local instance.',
        present: runnable,
        observation: runnable
          ? 'A recognized local run command appears in the setup path.'
          : setup
            ? 'The setup section has no recognized local run command.'
            : 'No Quick Start, Installation, or local development section was detected.',
        ...(setup ? { section: setup } : {}),
      },
    ];
  }
  if (type === 'api') {
    const setup = section(
      readme,
      /quick\s*start|install|get(?:ting)? started|run|development/i,
    );
    const example = section(readme, /request|endpoint|usage|example/i);
    const starts = commandsIn(readme, setup).some((command) => command.kind === 'usage');
    const request = Boolean(
      example &&
      readme.codeBlocks.some(
        (block) =>
          block.line >= example.heading.line &&
          block.line <= example.endLine &&
          /(?:\bcurl\b|\bhttpie\b|\bfetch\s*\(|\baxios\b|https?:\/\/[^\s]+)/i.test(
            block.value,
          ),
      ),
    );
    return [
      {
        id: 'local-run',
        label: 'Local API run path',
        reason: 'API adopters need a concrete command that starts the service.',
        present: starts,
        observation: starts
          ? 'A recognized API start command appears in setup.'
          : 'No recognized API start command was detected in setup.',
        ...(setup ? { section: setup } : {}),
      },
      {
        id: 'request-example',
        label: 'Request example',
        reason: 'API adopters need at least one concrete endpoint request.',
        present: request,
        observation: request
          ? 'A concrete HTTP request example appears in the README.'
          : 'No curl, HTTPie, fetch, Axios, or URL request example was detected.',
        ...(example ? { section: example } : {}),
      },
    ];
  }
  if (type === 'github-action') {
    const usage = section(readme, /usage|example|quick\s*start|get(?:ting)? started/i);
    const workflow = Boolean(
      usage &&
      readme.codeBlocks.some(
        (block) =>
          block.line >= usage.heading.line &&
          block.line <= usage.endLine &&
          /^(?:ya?ml)$/i.test(block.language ?? '') &&
          /^\s*(?:-\s*)?uses:\s*[^\s]+@[^\s]+/im.test(block.value),
      ),
    );
    return [
      {
        id: 'workflow-example',
        label: 'Workflow example',
        reason: 'Action adopters need a copyable workflow step pinned to a ref.',
        present: workflow,
        observation: workflow
          ? 'A language-tagged workflow example contains a pinned uses step.'
          : 'No YAML workflow example with a pinned uses step was detected.',
        ...(usage ? { section: usage } : {}),
      },
    ];
  }
  if (type === 'ai-model') {
    const usage = section(readme, /usage|inference|example/i);
    return [
      {
        id: 'usage',
        label: 'Usage',
        reason: 'Model users need a substantive inference example.',
        present: codeExampleIn(readme, usage),
        observation: codeExampleIn(readme, usage)
          ? 'A substantive language-tagged inference example appears in Usage.'
          : usage
            ? 'The Usage section has no substantive language-tagged inference example.'
            : 'No Usage, Inference, or Example section was detected.',
        ...(usage ? { section: usage } : {}),
      },
      sectionRequirement(
        readme,
        'limitations',
        'Limitations',
        /limitation|risk|known issue/i,
        'Model limitations are adoption-critical context.',
        10,
      ),
      sectionRequirement(
        readme,
        'license',
        'License',
        /license/i,
        'Model reuse depends on explicit licensing.',
        1,
      ),
    ];
  }
  return [];
}

export const completenessRule: Rule = {
  id: 'completeness.project-type',
  category: 'completeness',
  description:
    'Checks high-value project-type sections for substantive content, commands, or code examples—not heading presence alone.',
  applies: ({ project }) => STABLE_PROJECT_TYPES.has(project.primaryType),
  evaluate: ({ readme, project, config }) => {
    const required = requirements(project.primaryType, readme);
    const missing = required.filter((item) => !item.present);
    const weight = ruleWeight(
      'completeness.project-type',
      project.primaryType,
      config.scoring.preset,
    );
    const earned = Math.round(
      (weight * (required.length - missing.length)) / Math.max(required.length, 1),
    );
    return {
      score: missing.length
        ? missing.length < required.length
          ? partialScore(
              'completeness.project-type',
              weight,
              earned,
              `${missing.length} important ${project.primaryType} requirement(s) lack substantive evidence.`,
            )
          : failScore(
              'completeness.project-type',
              weight,
              earned,
              `${missing.length} important ${project.primaryType} requirement(s) lack substantive evidence.`,
            )
        : passScore(
            'completeness.project-type',
            weight,
            `All critical ${project.primaryType} requirements contain substantive evidence.`,
          ),
      findings: missing.map((item) =>
        finding({
          id: `completeness.${item.id}.present`,
          category: 'completeness',
          severity: 'high',
          priority: 'P1',
          confidence: 'medium',
          deterministic: false,
          title: `Incomplete ${item.label}`,
          observation: item.observation,
          impact: item.reason,
          recommendation: `Add the smallest substantive ${item.label} content appropriate for this ${project.primaryType} project.`,
          evidence: [
            { type: 'project-type', message: project.primaryType, value: project },
            {
              type: 'section-substance',
              message: item.section
                ? `${item.section.heading.text}: ${item.section.wordCount} prose words`
                : `${item.label}: not found`,
              path: readme.path,
              ...(item.section ? { line: item.section.heading.line } : {}),
            },
          ],
        }),
      ),
      facts: {
        completeness: {
          requirements: required.map((item) => ({
            id: item.id,
            label: item.label,
            present: item.present,
            observation: item.observation,
          })),
          missing: missing.map((item) => item.label),
        },
      },
    };
  },
};
