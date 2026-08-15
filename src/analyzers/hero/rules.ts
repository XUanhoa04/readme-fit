import type { Rule } from '../../rules/types.js';
import { failScore, finding, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

function heroText(raw: string, firstH2Line: number | undefined): string {
  return raw
    .split(/\r?\n/)
    .slice(0, Math.min((firstH2Line ?? 36) - 1, 35))
    .join('\n');
}

export const heroExplanationRule: Rule = {
  id: 'hero.explanation.present',
  category: 'clarity',
  description:
    'Checks whether the hero contains a concise prose explanation before detailed sections.',
  applies: () => true,
  evaluate: ({ readme, project }) => {
    const weight = ruleWeight('hero.explanation.present', project.primaryType);
    const firstH2 = readme.headings.find((heading) => heading.depth === 2)?.line;
    const hero = heroText(readme.raw, firstH2);
    const prose = hero
      .replace(/^#{1,6}\s+.*$/gm, '')
      .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^\s*[-*_]{3,}\s*$/gm, '')
      .trim();
    const explanationWords = prose.split(/\s+/).filter(Boolean).length;
    const hasName = readme.headings.some((heading) => heading.depth === 1);
    const findings = [];
    if (!hasName)
      findings.push(
        finding({
          id: 'structure.h1',
          category: 'clarity',
          severity: 'medium',
          priority: 'P2',
          title: 'README has no H1 project title',
          observation: 'No level-one heading was found in the Markdown AST.',
          impact: 'The project identity is less explicit to visitors and assistive tools.',
          recommendation: 'Add one H1 containing the project name.',
          evidence: [{ type: 'heading-count', message: 'H1 count: 0', path: readme.path }],
        }),
      );
    if (explanationWords < 5)
      findings.push(
        finding({
          id: 'hero.explanation.present',
          category: 'clarity',
          severity: 'high',
          priority: 'P1',
          confidence: 'medium',
          deterministic: false,
          title: 'Hero does not explain the project',
          source: { path: readme.path, line: 1 },
          observation: `Only ${explanationWords} prose words appear before the first major section.`,
          impact:
            'A visitor may see a name or badges without learning what the project does or why it matters.',
          recommendation:
            'Add a concise, outcome-oriented explanation directly below the project name.',
          evidence: [
            {
              type: 'hero-prose-words',
              message: `${explanationWords} prose words`,
              path: readme.path,
              value: explanationWords,
            },
          ],
        }),
      );
    return {
      score:
        explanationWords >= 5
          ? passScore(
              'hero.explanation.present',
              weight,
              'Hero contains a prose explanation.',
            )
          : failScore(
              'hero.explanation.present',
              weight,
              0,
              'Hero lacks a useful prose explanation.',
            ),
      findings,
      facts: {
        hero: {
          endLine: Math.min((firstH2 ?? 36) - 1, 35),
          explanationWords,
          hasProjectName: hasName,
        },
      },
    };
  },
};
