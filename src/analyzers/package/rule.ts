import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import { pythonPackageName } from '../../core/repository/python-metadata.js';
import { parseReadmeCommands } from '../../core/claims/commands.js';

function ecosystem(manager: string | undefined): 'npm' | 'python' | undefined {
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(manager ?? '')) return 'npm';
  if (['pip', 'uv', 'poetry'].includes(manager ?? '')) return 'python';
  return undefined;
}

function comparableName(value: string, target: 'npm' | 'python'): string {
  return target === 'python' ? value.toLowerCase().replace(/[-_.]+/g, '-') : value;
}

export const packageNameRule: Rule = {
  id: 'correctness.package-name.matches',
  category: 'correctness',
  description:
    'Compares package install and package-execution targets with metadata; it does not run them.',
  applies: ({ repository }) => Boolean(repository.packageJson || repository.pyproject),
  evaluate: ({ repository, readme, project, config }) => {
    const weight = ruleWeight(
      'correctness.package-name.matches',
      project.primaryType,
      config.scoring.preset,
    );
    const expectedNpm =
      typeof repository.packageJson?.name === 'string'
        ? repository.packageJson.name
        : undefined;
    const expectedPython = pythonPackageName(repository.pyproject);
    const found = parseReadmeCommands(readme)
      .filter((command): command is typeof command & { packageTarget: string } =>
        Boolean(command.packageTarget),
      )
      .flatMap((command) => {
        const target = ecosystem(command.manager);
        return target
          ? [
              {
                ecosystem: target,
                name: command.packageTarget,
                command: command.command,
                line: command.line,
              },
            ]
          : [];
      });
    const comparable = found.filter((claim) =>
      claim.ecosystem === 'npm' ? expectedNpm : expectedPython,
    );
    const mismatch = comparable.filter((claim) => {
      const expected = claim.ecosystem === 'npm' ? expectedNpm : expectedPython;
      return (
        expected &&
        comparableName(claim.name, claim.ecosystem) !==
          comparableName(expected, claim.ecosystem)
      );
    });
    if (!comparable.length) {
      return {
        score: naScore(
          'correctness.package-name.matches',
          'No comparable package target claim found.',
        ),
        findings: [],
        facts: { installClaims: found },
      };
    }
    return {
      score: mismatch.length
        ? failScore(
            'correctness.package-name.matches',
            weight,
            0,
            'Package target differs from repository metadata.',
          )
        : passScore(
            'correctness.package-name.matches',
            weight,
            'Package targets match repository metadata.',
          ),
      findings: mismatch.map((claim) => {
        const expected = claim.ecosystem === 'npm' ? expectedNpm : expectedPython;
        return finding({
          id: 'correctness.package-name.matches',
          category: 'correctness',
          severity: 'critical',
          priority: 'P0',
          title: 'Package name may be stale',
          source: { path: readme.path, line: claim.line },
          observation: `The README targets \`${claim.name}\`, while package metadata declares \`${expected}\`.`,
          impact:
            'Users may install or execute the wrong package, or receive a registry error.',
          recommendation: `Confirm the published name and align the command with \`${expected}\`.`,
          evidence: [
            {
              type: 'package-command',
              message: claim.command,
              path: readme.path,
              line: claim.line,
              value: claim,
            },
            {
              type: 'package-name',
              message: String(expected),
              path: claim.ecosystem === 'npm' ? 'package.json' : 'pyproject.toml',
            },
          ],
        });
      }),
      facts: { installClaims: found },
    };
  },
};
