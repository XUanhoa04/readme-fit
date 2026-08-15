import type { Rule } from '../../rules/types.js';
import { failScore, finding, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

export const trustLicenseRule: Rule = {
  id: 'trust.license.present',
  category: 'trust',
  description:
    'Checks whether a local license exists; presence is not treated as proof of every README claim.',
  applies: () => true,
  evaluate: ({ project, config }) => {
    const weight = ruleWeight(
      'trust.license.present',
      project.primaryType,
      config.scoring.preset,
    );
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
  evaluate: ({ repository, project, config }) => {
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
    const weight = ruleWeight(
      'trust.signals.present',
      project.primaryType,
      config.scoring.preset,
    );
    const expected = config.scoring.preset === 'oss' ? Object.keys(signals).length : 2;
    const passes = count >= expected;
    const missingSignals = Object.entries(signals)
      .filter(([, present]) => !present)
      .map(([name]) => name);
    return {
      score: passes
        ? passScore(
            'trust.signals.present',
            weight,
            `${count} meaningful trust signals found.`,
          )
        : failScore(
            'trust.signals.present',
            weight,
            Math.round((weight * count) / expected),
            `${count} of ${expected} trust signals required by the ${config.scoring.preset} preset were found.`,
          ),
      findings: passes
        ? []
        : [
            finding({
              id: 'trust.signals.present',
              category: 'trust',
              severity: 'low',
              priority: 'P3',
              confidence: 'medium',
              deterministic: false,
              title:
                config.scoring.preset === 'oss'
                  ? 'OSS maintenance evidence is incomplete'
                  : 'Limited visible maintenance signals',
              observation: `The ${config.scoring.preset} preset found ${count} of ${expected} expected signals. Missing: ${missingSignals.join(', ') || 'none'}.`,
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
