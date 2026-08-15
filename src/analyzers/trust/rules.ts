import type { Rule } from '../../rules/types.js';
import { failScore, finding, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

export const trustLicenseRule: Rule = {
  id: 'trust.license.present',
  category: 'trust',
  description:
    'Checks whether a local license exists; presence is not treated as proof of every README claim.',
  applies: () => true,
  evaluate: ({ project }) => {
    const weight = ruleWeight('trust.license.present', project.primaryType);
    return {
      score: project.hasLicense
        ? passScore('trust.license.present', weight, 'A local license file was found.')
        : failScore('trust.license.present', weight, 0, 'No local license file was found.'),
      findings: project.hasLicense
        ? []
        : [
            finding({
              id: 'trust.license.present',
              category: 'trust',
              severity: 'high',
              priority: 'P1',
              title: 'No license file detected',
              observation: 'The repository does not contain a recognizable LICENSE file.',
              impact: 'Potential adopters do not have explicit permission terms.',
              recommendation:
                'Add the intended license file and make package metadata and README agree.',
              evidence: [{ type: 'license-file', message: 'Not found' }],
            }),
          ],
    };
  },
};

export const trustSignalsRule: Rule = {
  id: 'trust.signals.present',
  category: 'trust',
  description:
    'Measures meaningful repository trust signals without using raw badge count as quality.',
  applies: () => true,
  evaluate: ({ repository, project }) => {
    const signals = {
      tests: project.hasTests,
      ci: repository.files.some((file) => /^\.github\/workflows\/.*\.ya?ml$/i.test(file)),
      contributing: repository.files.some((file) =>
        /(?:^|\/)contributing\.md$/i.test(file),
      ),
      security: repository.files.some((file) => /(?:^|\/)security\.md$/i.test(file)),
      changelog: repository.files.some((file) => /(?:^|\/)changelog\.md$/i.test(file)),
    };
    const count = Object.values(signals).filter(Boolean).length;
    const weight = ruleWeight('trust.signals.present', project.primaryType);
    return {
      score:
        count >= 2
          ? passScore(
              'trust.signals.present',
              weight,
              `${count} meaningful trust signals found.`,
            )
          : failScore(
              'trust.signals.present',
              weight,
              Math.round((weight * count) / 2),
              `Only ${count} meaningful trust signal(s) found.`,
            ),
      findings:
        count >= 2
          ? []
          : [
              finding({
                id: 'trust.signals.present',
                category: 'trust',
                severity: 'low',
                priority: 'P3',
                confidence: 'medium',
                deterministic: false,
                title: 'Limited visible maintenance signals',
                observation: `The static scan found ${count} of these signals: tests, CI, contributing guide, security policy, changelog.`,
                impact:
                  'Visitors have less public evidence about maintenance and contribution readiness.',
                recommendation:
                  'Add only signals that reflect real project practice; tests and CI are usually the strongest first additions.',
                evidence: [
                  {
                    type: 'trust-signals',
                    message: JSON.stringify(signals),
                    value: signals,
                  },
                ],
              }),
            ],
      facts: { trustSignals: signals },
    };
  },
};
