import type { Rule } from '../../rules/types.js';
import { failScore, finding, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import { runnableCommands } from '../onboarding/facts.js';

function metricRule(input: {
  id: string;
  title: string;
  test: (raw: string, context: Parameters<Rule['evaluate']>[0]) => { status: 'yes' | 'partly' | 'no'; evidence: string };
  recommendation: string;
}): Rule {
  return {
    id: input.id, category: 'impression', description: `Heuristically evaluates ${input.title.toLowerCase()} in the first impression.`, applies: () => true,
    evaluate: (context) => {
      const result = input.test(context.readme.raw, context);
      const weight = ruleWeight(input.id, context.project.primaryType);
      const earned = result.status === 'yes' ? weight : result.status === 'partly' ? Math.round(weight * 0.5) : 0;
      return {
        score: result.status === 'yes' ? passScore(input.id, weight, result.evidence) : failScore(input.id, weight, earned, result.evidence),
        findings: result.status === 'no' ? [finding({
          id: input.id, category: 'impression', severity: 'medium', priority: 'P2', confidence: 'medium', deterministic: false,
          title: input.title, observation: result.evidence, impact: 'A visitor scanning only the opening may leave without this answer.',
          recommendation: input.recommendation, evidence: [{ type: 'first-impression-heuristic', message: result.evidence, path: context.readme.path }],
        })] : [],
        facts: { [input.id]: result.status },
      };
    },
  };
}

export const impressionRules: Rule[] = [
  metricRule({
    id: 'impression.what', title: 'Project purpose is unclear in the hero', recommendation: 'State what the project does in one outcome-oriented sentence near the title.',
    test: (_raw, { readme }) => {
      const firstH2 = readme.headings.find((heading) => heading.depth === 2)?.line ?? 30;
      const hero = readme.raw.split(/\r?\n/).slice(0, firstH2 - 1).join(' ').replace(/[#>*`()!]/g, ' ').replaceAll('[', ' ').replaceAll(']', ' ');
      const words = hero.split(/\s+/).filter(Boolean).length;
      return { status: words >= 12 ? 'yes' : words >= 5 ? 'partly' : 'no', evidence: `${words} readable words were detected before the first major section.` };
    },
  }),
  metricRule({
    id: 'impression.why', title: 'Why the project matters is unclear', recommendation: 'Add one concrete outcome, pain point, or before/after statement near the hero.',
    test: (raw) => {
      const opening = raw.split(/\r?\n/).slice(0, 30).join(' ');
      const signals = /(?:so you can|without|instead of|helps? |save|faster|easier|find|prevent|because|why|problem|outcome)/i.test(opening);
      return { status: signals ? 'yes' : opening.split(/\s+/).length > 20 ? 'partly' : 'no', evidence: signals ? 'An outcome or problem signal appears in the opening.' : 'No explicit outcome, pain point, or reason-to-care signal was detected in the opening.' };
    },
  }),
  metricRule({
    id: 'impression.proof', title: 'Visitors cannot see the project working', recommendation: 'Place the smallest representative screenshot, terminal output, or demo near the first use path.',
    test: (_raw, { readme }) => {
      const earlyImage = readme.images.some((image) => image.line <= 40 && !/badge|shield/i.test(image.url));
      const earlyOutput = readme.codeBlocks.some((block) => block.line <= 50 && /(?:✓|score|found|success|\d+\/100)/i.test(block.value));
      return { status: earlyImage || earlyOutput ? 'yes' : readme.images.length || readme.codeBlocks.length > 1 ? 'partly' : 'no', evidence: earlyImage || earlyOutput ? 'Representative proof appears within the first 50 lines.' : 'No clear product proof appears within the first 50 lines.' };
    },
  }),
  metricRule({
    id: 'impression.try', title: 'Visitors cannot quickly tell how to try it', recommendation: 'Put the minimal install and first-run commands near the hero.',
    test: (_raw, { readme }) => {
      const first = runnableCommands(readme)[0];
      return { status: first && first.line <= 40 ? 'yes' : first ? 'partly' : 'no', evidence: first ? `First runnable command appears at line ${first.line}.` : 'No runnable command was detected.' };
    },
  }),
  metricRule({
    id: 'impression.trust', title: 'Trust signals are not visible', recommendation: 'Expose accurate license, testing/CI, release, or limitation information without adding decorative badge noise.',
    test: (_raw, { repository, project }) => {
      const signals = Number(project.hasLicense) + Number(project.hasTests) + Number(repository.files.some((file) => /^\.github\/workflows\//.test(file)));
      return { status: signals >= 2 ? 'yes' : signals === 1 ? 'partly' : 'no', evidence: `${signals} of 3 core repository trust signals were found: license, tests, CI.` };
    },
  }),
];
