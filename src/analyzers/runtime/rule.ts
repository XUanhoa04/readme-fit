import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import { pythonRuntimeConstraint } from '../../core/repository/python-metadata.js';

interface RuntimeComparison {
  runtime: 'Node' | 'Python';
  readmeVersion: string;
  declared: string;
  line: number;
  metadataPath: string;
  matches: boolean;
}

function version(value: string, parts: number): string | undefined {
  const match = value.match(/(\d+)(?:\.(\d+))?/);
  if (!match?.[1]) return undefined;
  return parts === 1 || !match[2] ? match[1] : `${match[1]}.${match[2]}`;
}

function lineOf(raw: string, index: number | undefined): number {
  return raw.slice(0, index ?? 0).split(/\r?\n/).length;
}

function nodeComparison(
  repository: Parameters<Rule['evaluate']>[0]['repository'],
  raw: string,
): RuntimeComparison | undefined {
  const readmeMatch = /Node(?:\.js)?\s*(?:version\s*)?(?:>=|≥|v)?\s*(\d+)/i.exec(raw);
  const engine = repository.packageJson?.engines;
  const engineNode =
    engine &&
    typeof engine === 'object' &&
    'node' in engine &&
    typeof engine.node === 'string'
      ? engine.node
      : undefined;
  const declared = engineNode ?? repository.nvmrc ?? repository.nodeVersion;
  const readmeVersion = readmeMatch?.[1];
  const declaredVersion = declared ? version(declared, 1) : undefined;
  if (!readmeVersion || !declared || !declaredVersion) return undefined;
  return {
    runtime: 'Node',
    readmeVersion,
    declared,
    line: lineOf(raw, readmeMatch.index),
    metadataPath: engineNode
      ? 'package.json'
      : repository.nvmrc
        ? '.nvmrc'
        : '.node-version',
    matches: readmeVersion === declaredVersion,
  };
}

function pythonComparison(
  repository: Parameters<Rule['evaluate']>[0]['repository'],
  raw: string,
): RuntimeComparison | undefined {
  const readmeMatch =
    /Python\s*(?:version\s*)?(?:>=|≥|v)?\s*(\d+)(?:\.(\d+))?/i.exec(raw);
  const pyprojectConstraint = pythonRuntimeConstraint(repository.pyproject);
  const declared = pyprojectConstraint ?? repository.pythonVersion;
  if (!readmeMatch?.[1] || !declared) return undefined;
  const readmeVersion = readmeMatch[2]
    ? `${readmeMatch[1]}.${readmeMatch[2]}`
    : readmeMatch[1];
  const declaredVersion = version(declared, readmeMatch[2] ? 2 : 1);
  if (!declaredVersion) return undefined;
  return {
    runtime: 'Python',
    readmeVersion,
    declared,
    line: lineOf(raw, readmeMatch.index),
    metadataPath: pyprojectConstraint ? 'pyproject.toml' : '.python-version',
    matches: readmeVersion === declaredVersion,
  };
}

export const runtimeRule: Rule = {
  id: 'correctness.runtime.matches',
  category: 'correctness',
  description:
    'Compares documented Node.js and Python versions with static repository metadata.',
  applies: ({ repository }) =>
    Boolean(
      repository.packageJson ||
        repository.nvmrc ||
        repository.nodeVersion ||
        repository.pyproject ||
        repository.pythonVersion,
    ),
  evaluate: ({ repository, readme, project, config }) => {
    const weight = ruleWeight(
      'correctness.runtime.matches',
      project.primaryType,
      config.scoring.preset,
    );
    const comparisons = [
      nodeComparison(repository, readme.raw),
      pythonComparison(repository, readme.raw),
    ].filter((item): item is RuntimeComparison => Boolean(item));
    if (!comparisons.length) {
      return {
        score: naScore(
          'correctness.runtime.matches',
          'README or comparable repository runtime constraint is absent.',
        ),
        findings: [],
      };
    }
    const mismatches = comparisons.filter((comparison) => !comparison.matches);
    return {
      score: mismatches.length
        ? failScore(
            'correctness.runtime.matches',
            weight,
            Math.round(
              (comparisons.filter((comparison) => comparison.matches).length /
                comparisons.length) *
                weight,
            ),
            `${mismatches.length} documented runtime constraint(s) differ from repository metadata.`,
          )
        : passScore(
            'correctness.runtime.matches',
            weight,
            'Documented runtime constraints match repository metadata.',
          ),
      findings: mismatches.map((comparison) =>
        finding({
          id: 'correctness.runtime.matches',
          category: 'correctness',
          severity: 'high',
          priority: 'P0',
          title: 'Runtime requirement may be stale',
          source: { path: readme.path, line: comparison.line },
          observation: `The README states ${comparison.runtime} ${comparison.readmeVersion}, while repository metadata declares \`${comparison.declared}\`.`,
          impact: 'Users cannot tell which runtime constraint is authoritative.',
          recommendation:
            'Align the README and runtime metadata after confirming the supported version.',
          evidence: [
            {
              type: 'readme-runtime',
              message: `${comparison.runtime} ${comparison.readmeVersion}`,
              path: readme.path,
              line: comparison.line,
            },
            {
              type: 'runtime-metadata',
              message: comparison.declared,
              path: comparison.metadataPath,
            },
          ],
        }),
      ),
      facts: {
        runtimeConstraints: comparisons.map((comparison) => ({
          runtime: comparison.runtime,
          readme: comparison.readmeVersion,
          metadata: comparison.declared,
          matches: comparison.matches,
        })),
      },
    };
  },
};
