import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

export const packageManagerRule: Rule = {
  id: 'correctness.package-manager.consistent',
  category: 'correctness',
  description:
    'Reports conflicting root JavaScript lockfiles that make the supported package manager ambiguous.',
  applies: ({ repository }) =>
    repository.workspace.packages.some((item) => item.ecosystem === 'node'),
  evaluate: ({ repository, project, config }) => {
    const conflicts = repository.workspace.lockfileConflicts;
    const weight = ruleWeight(
      'correctness.package-manager.consistent',
      project.primaryType,
      config.scoring.preset,
    );
    const rootLockfiles = repository.files.filter((file) =>
      /^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(file),
    );
    if (!rootLockfiles.length) {
      return {
        score: naScore(
          'correctness.package-manager.consistent',
          'No root JavaScript lockfile exists to establish a package manager.',
        ),
        findings: [],
      };
    }
    return {
      score: conflicts.length
        ? failScore(
            'correctness.package-manager.consistent',
            weight,
            0,
            `Conflicting root lockfiles were found for ${conflicts.join(', ')}.`,
          )
        : passScore(
            'correctness.package-manager.consistent',
            weight,
            'The root package manager is unambiguous.',
          ),
      findings: conflicts.length
        ? [
            finding({
              id: 'correctness.package-manager.consistent',
              category: 'correctness',
              severity: 'high',
              priority: 'P1',
              title: 'Multiple root lockfiles make onboarding ambiguous',
              observation: `Root lockfiles indicate multiple package managers: ${conflicts.join(', ')}.`,
              impact:
                'Contributors and automation may install different dependency graphs or follow the wrong README commands.',
              recommendation:
                'Keep the authoritative lockfile and document the supported package manager.',
              evidence: conflicts.map((manager) => ({
                type: 'package-manager-lockfile',
                message: manager,
                path:
                  manager === 'npm'
                    ? 'package-lock.json'
                    : manager === 'pnpm'
                      ? 'pnpm-lock.yaml'
                      : manager === 'yarn'
                        ? 'yarn.lock'
                        : 'bun.lock',
              })),
            }),
          ]
        : [],
    };
  },
};
