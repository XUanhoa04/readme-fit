import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';

function major(value: string): number | undefined {
  const match = value.match(/(\d+)/);
  return match?.[1] ? Number(match[1]) : undefined;
}

export const runtimeRule: Rule = {
  id: 'correctness.runtime.matches',
  category: 'correctness',
  description: 'Compares a documented Node.js minimum major with package engines and version files.',
  applies: ({ repository }) => Boolean(repository.packageJson || repository.nvmrc || repository.nodeVersion),
  evaluate: ({ repository, readme }) => {
    const readmeMatch = readme.raw.match(/Node(?:\.js)?\s*(?:version\s*)?(?:>=|≥|v)?\s*(\d+)/i);
    const engine = repository.packageJson?.engines;
    const engineNode = engine && typeof engine === 'object' && 'node' in engine && typeof engine.node === 'string' ? engine.node : undefined;
    const declared = engineNode ?? repository.nvmrc ?? repository.nodeVersion;
    if (!readmeMatch?.[1] || !declared) return { score: naScore('correctness.runtime.matches', 'README or repository runtime constraint is absent.'), findings: [] };
    const readmeMajor = Number(readmeMatch[1]);
    const metadataMajor = major(declared);
    if (metadataMajor === undefined || readmeMajor === metadataMajor) {
      return { score: passScore('correctness.runtime.matches', 15, 'README runtime matches repository metadata.'), findings: [], facts: { nodeRuntime: { readme: readmeMajor, metadata: declared } } };
    }
    const line = readme.raw.slice(0, readmeMatch.index).split(/\r?\n/).length;
    return {
      score: failScore('correctness.runtime.matches', 15, 0, 'README and repository runtime majors differ.'),
      findings: [finding({
        id: 'correctness.runtime.matches', category: 'correctness', severity: 'high', priority: 'P0',
        title: 'Runtime requirement may be stale', source: { path: readme.path, line },
        observation: `The README states Node ${readmeMajor}, while repository metadata declares \`${declared}\`.`,
        impact: 'Users cannot tell which runtime constraint is authoritative.',
        recommendation: 'Align the README, package engines, and version file after confirming the supported runtime.',
        evidence: [
          { type: 'readme-runtime', message: `Node ${readmeMajor}`, path: readme.path, line },
          { type: 'runtime-metadata', message: declared, path: engineNode ? 'package.json' : repository.nvmrc ? '.nvmrc' : '.node-version' },
        ],
      })],
      facts: { nodeRuntime: { readme: readmeMajor, metadata: declared } },
    };
  },
};
