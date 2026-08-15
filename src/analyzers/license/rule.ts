import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

function detectLicense(text?: string): string | undefined {
  if (!text) return undefined;
  if (/permission is hereby granted, free of charge/i.test(text)) return 'MIT';
  if (/apache license[\s\S]{0,80}version 2\.0/i.test(text)) return 'Apache-2.0';
  if (/isc license|permission to use, copy, modify, and\/or distribute/i.test(text))
    return 'ISC';
  if (/gnu general public license[\s\S]{0,80}version 3/i.test(text)) return 'GPL-3.0';
  return undefined;
}

export const licenseRule: Rule = {
  id: 'correctness.license.matches',
  category: 'correctness',
  description:
    'Compares recognizable README license claims with a confidently detected local license.',
  applies: () => true,
  evaluate: ({ repository, readme, project }) => {
    const weight = ruleWeight('correctness.license.matches', project.primaryType);
    const fileLicense = detectLicense(repository.licenseText);
    const metadataLicense =
      typeof repository.packageJson?.license === 'string'
        ? repository.packageJson.license
        : undefined;
    const detected = fileLicense ?? metadataLicense;
    const match = readme.raw.match(
      /\b(MIT|Apache(?: License)?(?: 2\.0|-2\.0)|ISC|GPL(?:v?3|-3\.0))\b/i,
    );
    if (!match?.[1] || !detected)
      return {
        score: naScore(
          'correctness.license.matches',
          'License claim or confident local detection is unavailable.',
        ),
        findings: [],
        facts: { detectedLicense: detected ?? 'unverified' },
      };
    const normalized = match[1].toUpperCase().startsWith('APACHE')
      ? 'Apache-2.0'
      : match[1].toUpperCase().startsWith('GPL')
        ? 'GPL-3.0'
        : match[1].toUpperCase();
    if (normalized.toLowerCase() === detected.toLowerCase())
      return {
        score: passScore(
          'correctness.license.matches',
          weight,
          'README license matches local evidence.',
        ),
        findings: [],
        facts: { detectedLicense: detected },
      };
    const line = readme.raw.slice(0, match.index).split(/\r?\n/).length;
    return {
      score: failScore(
        'correctness.license.matches',
        weight,
        0,
        'README license differs from local evidence.',
      ),
      findings: [
        finding({
          id: 'correctness.license.matches',
          category: 'correctness',
          severity: 'critical',
          priority: 'P0',
          title: 'License claim conflicts with repository',
          source: { path: readme.path, line },
          observation: `The README claims ${normalized}, while local metadata indicates ${detected}.`,
          impact: 'Conflicting license information creates legal uncertainty for adopters.',
          recommendation:
            'Confirm the intended license and make README, package metadata, and LICENSE agree.',
          evidence: [
            { type: 'readme-license', message: normalized, path: readme.path, line },
            {
              type: 'license-file',
              message: detected,
              path: fileLicense ? 'LICENSE' : 'package.json',
            },
          ],
        }),
      ],
      facts: { detectedLicense: detected },
    };
  },
};
