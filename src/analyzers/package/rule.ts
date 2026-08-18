import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import { pythonPackageName } from '../../core/repository/python-metadata.js';

interface InstallClaim {
  manager: 'npm' | 'pip';
  name: string;
  command: string;
  line: number;
}

function extractArg(argsString: string): string | undefined {
  const tokens = argsString.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.startsWith('-')) continue;
    const cleaned = token
      .replace(/==.*$/, '')
      .replace(/@[\d^~v].*$/, '')
      .replace(/\[.*\]$/, '');
    if (cleaned && /^@?[\w.-]+(?:\/[\w.-]+)?$/.test(cleaned)) {
      return cleaned;
    }
  }
  return undefined;
}

function claims(blocks: Array<{ value: string; line: number }>): InstallClaim[] {
  const output: InstallClaim[] = [];
  for (const block of blocks) {
    block.value.split(/\r?\n/).forEach((line, index) => {
      const clean = line.trim().replace(/^\$\s*/, '');
      const npm = clean.match(
        /^(?:npm\s+(?:install|i|add)|pnpm\s+(?:add|i|install)|yarn\s+(?:add|install)|bun\s+(?:add|i|install))\s+(.+)$/i,
      );
      const pip = clean.match(
        /^(?:pip3?\s+install|python3?\s+-m\s+pip\s+install|uv\s+(?:add|pip\s+install)|poetry\s+add)\s+(.+)$/i,
      );
      if (npm?.[1]) {
        const name = extractArg(npm[1]);
        if (name) {
          output.push({
            manager: 'npm',
            name,
            command: line.trim(),
            line: block.line + index + 1,
          });
        }
      }
      if (pip?.[1]) {
        const name = extractArg(pip[1]);
        if (name) {
          output.push({
            manager: 'pip',
            name,
            command: line.trim(),
            line: block.line + index + 1,
          });
        }
      }
    });
  }
  return output;
}

export const packageNameRule: Rule = {
  id: 'correctness.package-name.matches',
  category: 'correctness',
  description:
    'Compares npm/pip install targets with package metadata; it does not run the installation.',
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
    const expectedPip = pythonPackageName(repository.pyproject);
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
