import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

interface InstallClaim {
  manager: 'npm' | 'pip';
  name: string;
  command: string;
  line: number;
}

function claims(blocks: Array<{ value: string; line: number }>): InstallClaim[] {
  const output: InstallClaim[] = [];
  for (const block of blocks) {
    block.value.split(/\r?\n/).forEach((line, index) => {
      const npm = line.match(
        /(?:npm\s+(?:install|i)|pnpm\s+add|yarn\s+add)\s+(?:-[gD]\s+)?(@?[\w.-]+(?:\/[\w.-]+)?)/,
      );
      const pip = line.match(/(?:pip(?:3)?\s+install|uv\s+add)\s+([\w.-]+)/);
      if (npm?.[1])
        output.push({
          manager: 'npm',
          name: npm[1],
          command: line.trim(),
          line: block.line + index + 1,
        });
      if (pip?.[1])
        output.push({
          manager: 'pip',
          name: pip[1],
          command: line.trim(),
          line: block.line + index + 1,
        });
    });
  }
  return output;
}

function pythonName(pyproject?: string): string | undefined {
  return pyproject?.match(/(?:^|\n)name\s*=\s*["']([^"']+)["']/)?.[1];
}

export const packageNameRule: Rule = {
  id: 'correctness.package-name.matches',
  category: 'correctness',
  description:
    'Compares npm/pip install targets with package metadata; it does not run the installation.',
  applies: ({ repository }) => Boolean(repository.packageJson || repository.pyproject),
  evaluate: ({ repository, readme, project }) => {
    const weight = ruleWeight('correctness.package-name.matches', project.primaryType);
    const expectedNpm =
      typeof repository.packageJson?.name === 'string'
        ? repository.packageJson.name
        : undefined;
    const expectedPip = pythonName(repository.pyproject);
    const found = claims(readme.codeBlocks);
    const comparable = found.filter((claim) =>
      claim.manager === 'npm' ? expectedNpm : expectedPip,
    );
    const mismatch = comparable.filter(
      (claim) => claim.name !== (claim.manager === 'npm' ? expectedNpm : expectedPip),
    );
    if (!comparable.length)
      return {
        score: naScore(
          'correctness.package-name.matches',
          'No comparable install claim found.',
        ),
        findings: [],
        facts: { installClaims: found },
      };
    return {
      score: mismatch.length
        ? failScore(
            'correctness.package-name.matches',
            weight,
            0,
            'Install target differs from package metadata.',
          )
        : passScore(
            'correctness.package-name.matches',
            weight,
            'Install target matches package metadata.',
          ),
      findings: mismatch.map((claim) => {
        const expected = claim.manager === 'npm' ? expectedNpm : expectedPip;
        return finding({
          id: 'correctness.package-name.matches',
          category: 'correctness',
          severity: 'critical',
          priority: 'P0',
          title: 'Installation package name may be stale',
          source: { path: readme.path, line: claim.line },
          observation: `The README installs \`${claim.name}\`, while package metadata declares \`${expected}\`.`,
          impact: 'Users may install the wrong package or receive a registry error.',
          recommendation: `Confirm the published name and align the install command with \`${expected}\`.`,
          evidence: [
            {
              type: 'install-command',
              message: claim.command,
              path: readme.path,
              line: claim.line,
            },
            {
              type: 'package-name',
              message: String(expected),
              path: claim.manager === 'npm' ? 'package.json' : 'pyproject.toml',
            },
          ],
        });
      }),
      facts: { installClaims: found },
    };
  },
};
