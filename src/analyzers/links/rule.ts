import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

function isRelative(url: string): boolean {
  return Boolean(url) && !/^(?:[a-z]+:|\/\/|#)/i.test(url);
}

function headingAnchors(
  headings: Array<{ text: string }>,
  htmlBlocks: Array<{ value: string }>,
): Set<string> {
  const anchors = new Set<string>();
  const counts = new Map<string, number>();
  for (const heading of headings) {
    const base = heading.text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/g, '-');
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count ? `${base}-${count}` : base);
  }
  for (const block of htmlBlocks) {
    for (const match of block.value.matchAll(/\b(?:id|name)=["']([^"']+)["']/gi)) {
      if (match[1]) anchors.add(match[1].toLowerCase());
    }
  }
  return anchors;
}

function fragmentOf(url: string): string | undefined {
  const hash = url.indexOf('#');
  if (hash < 0 || hash === url.length - 1) return undefined;
  try {
    return decodeURIComponent(url.slice(hash + 1)).toLowerCase();
  } catch {
    return url.slice(hash + 1).toLowerCase();
  }
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
    const candidates = readme.links.filter(
      (link) => isRelative(link.url) || link.url.startsWith('#'),
    );
    if (!candidates.length) {
      return {
        score: naScore(
          'correctness.link.exists',
          'No relative link or anchor claim was found.',
        ),
        findings: [],
        facts: { relativeLinks: 0, brokenRelativeLinks: 0 },
      };
    }
    const broken = [];
    const readmeDirectory = path.dirname(path.join(repository.root, readme.path));
    const absoluteReadme = path.resolve(repository.root, readme.path);
    const anchors = headingAnchors(readme.headings, readme.htmlBlocks);
    const [canonicalRoot, canonicalReadme] = await Promise.all([
      realpath(repository.root),
      realpath(absoluteReadme),
    ]);
    for (const link of candidates) {
      const fragment = fragmentOf(link.url);
      if (link.url.startsWith('#')) {
        if (fragment && !anchors.has(fragment)) {
          broken.push({ ...link, reason: `heading anchor #${fragment} does not exist` });
        }
        continue;
      }
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
        } else if (
          fragment &&
          canonicalTarget === canonicalReadme &&
          !anchors.has(fragment)
        ) {
          broken.push({ ...link, reason: `heading anchor #${fragment} does not exist` });
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
