import type { ReadmeDocument } from '../../models/index.js';
import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import { hasExpectedOutput, wordsBefore } from '../onboarding/facts.js';

interface Demo {
  kind: string;
  url?: string;
  line: number;
}

function demos(readme: ReadmeDocument): Demo[] {
  const found: Demo[] = readme.images
    .filter(
      (image) =>
        !/shields\.io|badge|badgen|github\.com\/.*actions\/workflows/i.test(
          `${image.url} ${image.text}`,
        ),
    )
    .map((image) => ({
      kind: /\.gif(?:[?#]|$)/i.test(image.url)
        ? 'animated image'
        : /(?:screenshot|demo|preview|terminal)/i.test(`${image.url} ${image.text}`)
          ? 'screenshot'
          : 'image',
      url: image.url,
      line: image.line,
    }));
  for (const link of readme.links) {
    if (/youtube\.com|youtu\.be|asciinema\.org|vimeo\.com/i.test(link.url))
      found.push({
        kind: /asciinema/i.test(link.url) ? 'terminal recording' : 'video link',
        url: link.url,
        line: link.line,
      });
  }
  if (hasExpectedOutput(readme)) {
    const output = readme.codeBlocks.find((block) =>
      /(?:✓|✔|score|found|success|readme fit|\d+\/100)/i.test(block.value),
    );
    if (output) found.push({ kind: 'terminal output', line: output.line });
  }
  return found;
}

function relevant(type: string): boolean {
  return [
    'cli',
    'developer-tool',
    'web-app',
    'desktop-app',
    'mobile-app',
    'github-action',
  ].includes(type);
}

export const demoPresenceRule: Rule = {
  id: 'visual.demo.present',
  category: 'visual-proof',
  description:
    'Detects product proof and applies it only where seeing the project materially supports adoption.',
  applies: () => true,
  evaluate: ({ readme, project }) => {
    const weight = ruleWeight('visual.demo.present', project.primaryType);
    const found = demos(readme);
    if (!relevant(project.primaryType) || weight === 0)
      return {
        score: naScore(
          'visual.demo.present',
          `A visual demo is optional for ${project.primaryType}; its absence is not penalized.`,
        ),
        findings: [],
        facts: { demos: found },
      };
    return {
      score: found.length
        ? passScore(
            'visual.demo.present',
            weight,
            `Detected ${found.length} form(s) of product proof.`,
          )
        : failScore('visual.demo.present', weight, 0, 'No visible product proof detected.'),
      findings: found.length
        ? []
        : [
            finding({
              id: 'visual.demo.present',
              category: 'visual-proof',
              severity: project.primaryType === 'desktop-app' ? 'high' : 'medium',
              priority: 'P1',
              confidence: 'medium',
              deterministic: false,
              title: 'No immediate product demonstration',
              observation: `No screenshot, GIF, video, terminal recording, or representative output was detected for this ${project.primaryType} project.`,
              impact:
                'Visitors must understand the value abstractly instead of seeing the project work.',
              recommendation: project.hasCli
                ? 'Show the smallest representative terminal result; a logo is not required.'
                : 'Add a representative screenshot or concise demo of the core experience.',
              evidence: [
                {
                  type: 'demo-count',
                  message: 'No relevant visual proof detected',
                  path: readme.path,
                  value: 0,
                },
              ],
            }),
          ],
      facts: { demos: found },
    };
  },
};

export const demoPlacementRule: Rule = {
  id: 'visual.demo.placement',
  category: 'visual-proof',
  description:
    'Measures how much content appears before the first detected product demonstration.',
  applies: ({ project }) => relevant(project.primaryType),
  evaluate: ({ readme, project }) => {
    const found = demos(readme).sort((a, b) => a.line - b.line);
    if (!found[0])
      return {
        score: naScore('visual.demo.placement', 'No demo exists to evaluate placement.'),
        findings: [],
      };
    const before = wordsBefore(readme, found[0].line);
    const weight = ruleWeight('visual.demo.placement', project.primaryType);
    const late = before > 250;
    return {
      score: late
        ? failScore(
            'visual.demo.placement',
            weight,
            Math.round(weight * 0.3),
            'The first demonstration follows substantial content.',
          )
        : passScore(
            'visual.demo.placement',
            weight,
            'Product proof appears before substantial explanatory content.',
          ),
      findings: late
        ? [
            finding({
              id: 'visual.demo.placement',
              category: 'visual-proof',
              severity: 'medium',
              priority: 'P2',
              confidence: 'medium',
              deterministic: false,
              title: 'Product demonstration appears late',
              source: { path: readme.path, line: found[0].line },
              observation: `The first ${found[0].kind} appears at line ${found[0].line}, after approximately ${before} words.`,
              impact:
                'A visitor must understand the project abstractly before seeing the result.',
              recommendation:
                'Consider moving a compact, representative proof directly below the hero or Quick Start.',
              evidence: [
                {
                  type: 'first-demo',
                  message: found[0].kind,
                  path: readme.path,
                  line: found[0].line,
                },
                { type: 'words-before-demo', message: `${before} words`, value: before },
              ],
            }),
          ]
        : [],
      facts: { firstDemo: { ...found[0], wordsBefore: before } },
    };
  },
};
