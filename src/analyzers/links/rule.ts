import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Rule } from '../../rules/types.js';
import { failScore, finding, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

function isRelative(url: string): boolean {
  return Boolean(url) && !/^(?:[a-z]+:|\/\/|#)/i.test(url);
}

function cleanUrl(url: string): string {
  try {
    return decodeURIComponent(url.split(/[?#]/, 1)[0] ?? '');
  } catch {
    return url.split(/[?#]/, 1)[0] ?? '';
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export const relativeLinkRule: Rule = {
  id: 'correctness.link.exists',
  category: 'correctness',
  description:
    'Verifies that relative Markdown links and image paths resolve inside the repository.',
  applies: () => true,
  evaluate: async ({ repository, readme, project, config }) => {
    const weight = ruleWeight(
      'correctness.link.exists',
      project.primaryType,
      config.scoring.preset,
    );
    const candidates = readme.links.filter((link) => isRelative(link.url));
    const broken = [];
    const readmeDirectory = path.dirname(path.join(repository.root, readme.path));
    const canonicalRoot = await realpath(repository.root);
    for (const link of candidates) {
      const target = path.resolve(readmeDirectory, cleanUrl(link.url));
      if (!isInside(repository.root, target)) {
        broken.push({ ...link, reason: 'target escapes repository root' });
        continue;
      }
      try {
        await access(target);
        const canonicalTarget = await realpath(target);
        if (!isInside(canonicalRoot, canonicalTarget)) {
          broken.push({ ...link, reason: 'symlink target escapes repository root' });
        }
      } catch {
        broken.push({ ...link, reason: 'target does not exist' });
      }
    }
    return {
      score: broken.length
        ? failScore(
            'correctness.link.exists',
            weight,
            Math.max(0, weight - broken.length * 8),
            `${broken.length} broken relative link(s).`,
          )
        : passScore(
            'correctness.link.exists',
            weight,
            candidates.length ? 'All relative paths exist.' : 'No relative links found.',
          ),
      findings: broken.map((link) =>
        finding({
          id: 'correctness.link.exists',
          category: 'correctness',
          severity: 'high',
          priority: 'P0',
          title: link.image ? 'Broken README image' : 'Broken relative link',
          source: { path: readme.path, line: link.line },
          observation: `\`${link.url}\` cannot be resolved: ${link.reason}.`,
          impact: link.image
            ? 'The README cannot display this visual evidence.'
            : 'Visitors cannot reach the referenced documentation or example.',
          recommendation: 'Restore the target or update the README path.',
          evidence: [
            {
              type: link.image ? 'relative-image' : 'relative-link',
              message: link.url,
              path: readme.path,
              line: link.line,
            },
          ],
        }),
      ),
      facts: { relativeLinks: candidates.length, brokenRelativeLinks: broken.length },
    };
  },
};
