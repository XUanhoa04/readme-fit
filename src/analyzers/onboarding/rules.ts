import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import {
  firstSuccessCommand,
  hasExpectedOutput,
  runnableCommands,
  wordsBefore,
} from './facts.js';

const ONBOARDING_TYPES = new Set([
  'cli',
  'library',
  'sdk',
  'developer-tool',
  'api',
  'github-action',
  'ai-model',
  'ai-agent',
]);

export const quickStartRule: Rule = {
  id: 'onboarding.quick-start.present',
  category: 'onboarding',
  description:
    'Checks for a runnable command and a Quick Start, Getting Started, Usage, or Installation path.',
  applies: ({ project }) => ONBOARDING_TYPES.has(project.primaryType) || project.hasCli,
  evaluate: ({ readme, project, config }) => {
    const commands = runnableCommands(readme);
    const heading = readme.headings.find((item) =>
      /quick\s*start|get(?:ting)? started|usage|install/i.test(item.text),
    );
    const usageCommands = commands.filter((command) => command.kind === 'usage');
    const codeExample = readme.codeBlocks.find((block) =>
      /^(?:js|jsx|ts|tsx|javascript|typescript|py|python|rs|rust|go|java)$/i.test(
        block.language ?? '',
      ),
    );
    const successStep = ['library', 'sdk'].includes(project.primaryType)
      ? usageCommands.length > 0 || Boolean(codeExample)
      : usageCommands.length > 0;
    const passes = successStep && Boolean(heading);
    const weight = ruleWeight(
      'onboarding.quick-start.present',
      project.primaryType,
      config.scoring.preset,
    );
    return {
      score: passes
        ? passScore(
            'onboarding.quick-start.present',
            weight,
            'A labeled onboarding path contains runnable guidance.',
          )
        : failScore(
            'onboarding.quick-start.present',
            weight,
            successStep ? Math.round(weight * 0.4) : 0,
            'A complete quick-start path was not found.',
          ),
      findings: passes
        ? []
        : [
            finding({
              id: 'onboarding.quick-start.present',
              category: 'onboarding',
              severity: 'high',
              priority: 'P1',
              title: 'No complete Quick Start',
              observation: successStep
                ? 'A first-success step exists, but no clearly labeled Quick Start, Getting Started, Usage, or Installation section was found.'
                : 'Installation may be documented, but no runnable usage command or relevant code example shows first success.',
              impact:
                'A new user must assemble the onboarding path instead of following one minimal route to success.',
              recommendation:
                'Add a compact Quick Start with install, first run, and the smallest expected result.',
              evidence: [
                {
                  type: 'runnable-command-count',
                  message: `${commands.length} runnable command(s)`,
                  path: readme.path,
                  value: commands,
                },
                {
                  type: 'onboarding-heading',
                  message: heading?.text ?? 'not found',
                  path: readme.path,
                  ...(heading ? { line: heading.line } : {}),
                },
              ],
            }),
          ],
      facts: {
        runnableCommands: commands,
        installCommands: commands.filter((command) => command.kind === 'install'),
        usageCommands,
        quickStartHeading: heading ?? null,
      },
    };
  },
};

export const firstCommandRule: Rule = {
  id: 'onboarding.first-command.early',
  category: 'onboarding',
  description:
    'Measures the line and approximate prose volume before the first runnable command using project-aware concern levels.',
  applies: ({ project }) =>
    project.hasCli ||
    ['cli', 'developer-tool', 'api', 'github-action', 'ai-model', 'ai-agent'].includes(
      project.primaryType,
    ),
  evaluate: ({ readme, project, config }) => {
    const first = firstSuccessCommand(readme);
    const weight = ruleWeight(
      'onboarding.first-command.early',
      project.primaryType,
      config.scoring.preset,
    );
    if (!first)
      return {
        score: failScore(
          'onboarding.first-command.early',
          weight,
          0,
          'No runnable first-success command found.',
        ),
        findings: [],
        facts: { firstSuccessCommand: null },
      };
    const before = wordsBefore(readme, first.line);
    const concern = project.primaryType === 'cli' ? before > 180 : before > 300;
    return {
      score: concern
        ? failScore(
            'onboarding.first-command.early',
            weight,
            Math.round(weight * 0.4),
            `${before} words precede the first-success command.`,
          )
        : passScore(
            'onboarding.first-command.early',
            weight,
            'The first-success command appears early enough for this project type.',
          ),
      findings: concern
        ? [
            finding({
              id: 'onboarding.first-command.early',
              category: 'onboarding',
              severity: 'medium',
              priority: 'P1',
              confidence: 'medium',
              deterministic: false,
              title: 'First-success command appears late',
              source: { path: readme.path, line: first.line },
              observation: `The first usage command, \`${first.command}\`, appears at line ${first.line} after approximately ${before} words. Installation commands are measured separately.`,
              impact: `Visitors must absorb substantial context before trying this ${project.primaryType} project.`,
              recommendation:
                'Move the smallest runnable path near the hero; retain deeper explanation later.',
              evidence: [
                {
                  type: 'first-success-command',
                  message: first.command,
                  path: readme.path,
                  line: first.line,
                },
                {
                  type: 'words-before-command',
                  message: `${before} words`,
                  path: readme.path,
                  value: before,
                },
              ],
            }),
          ]
        : [],
      facts: {
        firstSuccessCommand: {
          command: first.command,
          line: first.line,
          wordsBefore: before,
        },
      },
    };
  },
};

export const expectedOutputRule: Rule = {
  id: 'onboarding.expected-output.present',
  category: 'onboarding',
  description:
    'Checks whether CLI/developer-tool commands are followed by a compact representation of successful output.',
  applies: ({ project }) =>
    project.hasCli || ['cli', 'developer-tool'].includes(project.primaryType),
  evaluate: ({ readme, project, config }) => {
    const commands = runnableCommands(readme).filter((command) => command.kind === 'usage');
    if (!commands.length)
      return {
        score: naScore(
          'onboarding.expected-output.present',
          'No core command is available to pair with output.',
        ),
        findings: [],
      };
    const first = commands[0];
    if (!first)
      return {
        score: naScore(
          'onboarding.expected-output.present',
          'No core command is available to pair with output.',
        ),
        findings: [],
      };
    const present = hasExpectedOutput(readme);
    const weight = ruleWeight(
      'onboarding.expected-output.present',
      project.primaryType,
      config.scoring.preset,
    );
    return {
      score: present
        ? passScore(
            'onboarding.expected-output.present',
            weight,
            'A nearby expected-result example was detected.',
          )
        : failScore(
            'onboarding.expected-output.present',
            weight,
            0,
            'Core command has no nearby expected result.',
          ),
      findings: present
        ? []
        : [
            finding({
              id: 'onboarding.expected-output.present',
              category: 'onboarding',
              severity: 'high',
              priority: 'P1',
              confidence: 'medium',
              deterministic: false,
              title: 'Core command shown without expected result',
              source: { path: readme.path, line: first.line },
              observation:
                'Users can see how to execute the tool, but no nearby output example shows what success looks like.',
              impact:
                'The value and expected behavior remain abstract at the first point of use.',
              recommendation:
                'Add a compact representative output block or terminal demo after the first command.',
              evidence: [
                {
                  type: 'core-command',
                  message: first.command,
                  path: readme.path,
                  line: first.line,
                },
              ],
            }),
          ],
      facts: { expectedOutputPresent: present },
    };
  },
};
