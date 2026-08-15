import type { Rule } from '../../rules/types.js';
import { failScore, finding } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

export const metadataParseRule: Rule = {
  id: 'correctness.metadata.parseable',
  category: 'correctness',
  description:
    'Reports repository metadata that cannot be parsed for static README verification.',
  applies: ({ repository }) => Boolean(repository.metadataIssues?.length),
  evaluate: ({ repository, project, config }) => {
    const issues = repository.metadataIssues ?? [];
    const weight = ruleWeight(
      'correctness.metadata.parseable',
      project.primaryType,
      config.scoring.preset,
    );
    return {
      score: failScore(
        'correctness.metadata.parseable',
        weight,
        0,
        `${issues.length} repository metadata file(s) could not be parsed.`,
      ),
      findings: issues.map((issue) =>
        finding({
          id: 'correctness.metadata.parseable',
          category: 'correctness',
          severity: 'high',
          priority: 'P0',
          title: 'Repository metadata is not parseable',
          source: { path: issue.path },
          observation: issue.message,
          impact: 'README claims depending on this metadata cannot be verified reliably.',
          recommendation:
            'Repair the metadata syntax, then rerun readme-fit for complete verification.',
          evidence: [
            { type: 'metadata-parse-error', message: issue.message, path: issue.path },
          ],
        }),
      ),
      facts: { metadataIssues: issues },
    };
  },
};
