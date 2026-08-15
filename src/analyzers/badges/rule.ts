import type { Rule } from '../../rules/types.js';
import { failScore, finding, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

export const badgeRule: Rule = {
  id: 'trust.badges.signal-to-noise',
  category: 'trust',
  description:
    'Counts badge-like images, placement, likely duplicates, and badge walls without rewarding badge volume.',
  applies: () => true,
  evaluate: ({ readme, project }) => {
    const badges = readme.images.filter((image) =>
      /shields\.io|badge|badgen|github\.com\/.*actions\/workflows/i.test(image.url),
    );
    const early = badges.filter((badge) => badge.line <= 15);
    const identities = badges.map((badge) =>
      badge.url.replace(/[?#].*$/, '').toLowerCase(),
    );
    const duplicates = identities.filter(
      (value, index) => identities.indexOf(value) !== index,
    );
    const wall = early.length > 8;
    const weight = ruleWeight('trust.badges.signal-to-noise', project.primaryType);
    return {
      score:
        wall || duplicates.length
          ? failScore(
              'trust.badges.signal-to-noise',
              weight,
              Math.round(weight * 0.4),
              'Badge volume or duplication reduces signal.',
            )
          : passScore(
              'trust.badges.signal-to-noise',
              weight,
              'Badges do not overwhelm the project explanation.',
            ),
      findings:
        wall || duplicates.length
          ? [
              finding({
                id: 'trust.badges.signal-to-noise',
                category: 'trust',
                severity: 'low',
                priority: 'P3',
                confidence: 'medium',
                deterministic: false,
                title: 'Badge wall creates visual noise',
                observation: `${badges.length} badges were detected; ${early.length} appear in the first 15 lines${duplicates.length ? ` and ${duplicates.length} may be duplicated` : ''}.`,
                impact:
                  'Status decoration competes with the explanation a visitor needs first.',
                recommendation:
                  'Keep badges that communicate meaningful user-facing status such as CI, release, package, or license; move or remove the rest.',
                evidence: [
                  {
                    type: 'badge-count',
                    message: `${badges.length} badges`,
                    path: readme.path,
                    value: badges,
                  },
                  {
                    type: 'early-badge-count',
                    message: `${early.length} badges in first 15 lines`,
                    value: early.length,
                  },
                ],
              }),
            ]
          : [],
      facts: {
        badges: {
          count: badges.length,
          earlyCount: early.length,
          possibleDuplicates: duplicates.length,
        },
      },
    };
  },
};
