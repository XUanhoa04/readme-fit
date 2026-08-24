import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import { parseReadmeCommands } from '../../core/claims/commands.js';

export const commandExistsRule: Rule = {
  id: 'correctness.command.exists',
  category: 'correctness',
  description:
    'Checks documented npm, pnpm, Yarn, and Bun script commands against package.json without executing them.',
  applies: ({ repository }) => Boolean(repository.packageJson),
  evaluate: ({ repository, readme, project, config }) => {
    const weight = ruleWeight(
      'correctness.command.exists',
      project.primaryType,
      config.scoring.preset,
    );
    const scriptsValue = repository.packageJson?.scripts;
    const scripts =
      scriptsValue && typeof scriptsValue === 'object' && !Array.isArray(scriptsValue)
        ? (scriptsValue as Record<string, unknown>)
        : {};
    const commands = parseReadmeCommands(readme).filter(
      (command): command is typeof command & { script: string } => Boolean(command.script),
    );
    if (!commands.length) {
      return {
        score: naScore(
          'correctness.command.exists',
          'No package-script command claim was found.',
        ),
        findings: [],
        facts: { documentedPackageCommands: [] },
      };
    }
    const invalid = commands.filter((item) => !(item.script in scripts));
    return {
      score: invalid.length
        ? failScore(
            'correctness.command.exists',
            weight,
            0,
            `${invalid.length} documented package script(s) do not exist.`,
          )
        : passScore(
            'correctness.command.exists',
            weight,
            commands.length
              ? 'All documented package scripts exist.'
              : 'No package-script claims found.',
          ),
      findings: invalid.map((item) =>
        finding({
          id: 'correctness.command.exists',
          category: 'correctness',
          severity: 'critical',
          priority: 'P0',
          title: 'README command may be stale',
          source: { path: readme.path, line: item.line },
          observation: `The README documents \`${item.command}\`, but package.json contains no "${item.script}" script.`,
          impact:
            'A new user following the documented command will receive a package-manager error.',
          recommendation: `Replace the command with an existing script or add the missing "${item.script}" script.`,
          evidence: [
            {
              type: 'readme-command',
              message: item.command,
              path: readme.path,
              line: item.line,
              value: { manager: item.manager, script: item.script },
            },
            {
              type: 'package-scripts',
              message: `Available scripts: ${Object.keys(scripts).join(', ') || '(none)'}`,
              path: 'package.json',
              value: Object.keys(scripts),
            },
          ],
        }),
      ),
      facts: {
        documentedPackageCommands: commands.map((command) => ({
          command: command.command,
          script: command.script,
          line: command.line,
          manager: command.manager,
        })),
      },
    };
  },
};
