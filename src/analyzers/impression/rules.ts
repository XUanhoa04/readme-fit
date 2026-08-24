import type { Rule } from '../../rules/types.js';
import { failScore, finding, partialScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import { firstSuccessCommand } from '../onboarding/facts.js';
import { productProofs } from '../visuals/rules.js';

export function outcomeSignals(opening: string): string[] {
  const prose = opening
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const patterns = [
    /\b(?:helps?|lets?|enables?)\s+(?:you|teams?|developers?|users?|maintainers?)\s+\w+/i,
    /\bso\s+(?:you|teams?|developers?|users?|maintainers?)\s+can\b/i,
    /\bwithout\s+(?:having|needing|writing|running|manually|the)\b/i,
    /\b(?:reduce|prevent|avoid|save|eliminate|catch|detect|surface|finds?)\s+(?:\w+\s+){0,2}(?:drift|errors?|issues?|risks?|time|manual work|unused code|vulnerabilit\w*)\b/i,
    /\b(?:turn|transform)\s+[^.!?]{2,80}\s+into\b/i,
    /\binstead of\b/i,
    /\bbefore\s+[^.!?]{2,60}\s+breaks?\b/i,
  ];
  return patterns.flatMap((pattern) => prose.match(pattern)?.[0] ?? []);
}

function metricRule(input: {
  id: string;
  title: string;
  test: (
    raw: string,
    context: Parameters<Rule['evaluate']>[0],
  ) => { status: 'yes' | 'partly' | 'no'; evidence: string };
  recommendation: string;
}): Rule {
  return {
    id: input.id,
    category: 'impression',
    description: `Heuristically evaluates ${input.title.toLowerCase()} in the first impression.`,
    applies: () => true,
    evaluate: (context) => {
      const result = input.test(context.readme.raw, context);
      const weight = ruleWeight(
        input.id,
        context.project.primaryType,
        context.config.scoring.preset,
      );
      const earned =
        result.status === 'yes'
          ? weight
          : result.status === 'partly'
            ? Math.round(weight * 0.5)
            : 0;
      return {
        score:
          result.status === 'yes'
            ? passScore(input.id, weight, result.evidence)
            : result.status === 'partly'
              ? partialScore(input.id, weight, earned, result.evidence)
              : failScore(input.id, weight, earned, result.evidence),
        findings:
          result.status !== 'yes'
            ? [
                finding({
                  id: input.id,
                  category: 'impression',
                  severity: result.status === 'partly' ? 'low' : 'medium',
                  priority: result.status === 'partly' ? 'P3' : 'P2',
                  confidence: 'medium',
                  deterministic: false,
                  title: input.title,
                  observation: result.evidence,
                  impact:
                    'A visitor scanning only the opening may leave without this answer.',
                  recommendation: input.recommendation,
                  evidence: [
                    {
                      type: 'first-impression-heuristic',
                      message: result.evidence,
                      path: context.readme.path,
                    },
                  ],
                }),
              ]
            : [],
        facts: { [input.id]: result.status },
      };
    },
  };
}

export const impressionRules: Rule[] = [
  metricRule({
    id: 'impression.what',
    title: 'Project purpose is unclear in the hero',
    recommendation:
      'State what the project does in one outcome-oriented sentence near the title.',
    test: (_raw, { readme }) => {
      const firstH2 = readme.headings.find((heading) => heading.depth === 2)?.line ?? 30;
      const hero = readme.raw
        .split(/\r?\n/)
        .slice(0, firstH2 - 1)
        .join('\n')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/[#>*`()!]/g, ' ')
        .replaceAll('[', ' ')
        .replaceAll(']', ' ');
      const words = hero.split(/\s+/).filter(Boolean).length;
      return {
        status: words >= 12 ? 'yes' : words >= 5 ? 'partly' : 'no',
        evidence: `${words} readable words were detected before the first major section.`,
      };
    },
  }),
  metricRule({
    id: 'impression.why',
    title: 'Why the project matters is unclear',
    recommendation:
      'Add one concrete outcome, pain point, or before/after statement near the hero.',
    test: (raw) => {
      const opening = raw.split(/\r?\n/).slice(0, 30).join(' ');
      const signals = outcomeSignals(opening);
      const audience =
        /\b(?:for|built for)\s+(?:teams?|developers?|users?|maintainers?)/i.test(opening);
      return {
        status: signals.length ? 'yes' : audience ? 'partly' : 'no',
        evidence: signals.length
          ? `A concrete outcome or pain-point pattern appears in the opening: "${signals[0]}".`
          : audience
            ? 'A target audience is visible, but no concrete outcome or pain-point pattern was detected.'
            : 'No explicit outcome, pain point, or reason-to-care signal was detected in the opening.',
      };
    },
  }),
  metricRule({
    id: 'impression.proof',
    title: 'Visitors cannot see the project working',
    recommendation:
      'Place the smallest representative screenshot, terminal output, or demo near the first use path.',
    test: (_raw, { readme }) => {
      const proofs = productProofs(readme);
      const earlyProof = proofs.some((proof) => proof.line <= 50);
      return {
        status: earlyProof ? 'yes' : proofs.length ? 'partly' : 'no',
        evidence: earlyProof
          ? 'Representative product proof appears within the first 50 lines.'
          : proofs.length
            ? `Product proof exists, but the first example appears at line ${Math.min(...proofs.map((proof) => proof.line))}.`
            : 'No representative screenshot, recording, or output was detected; generic images and code examples are not treated as proof.',
      };
    },
  }),
  metricRule({
    id: 'impression.try',
    title: 'Visitors cannot quickly tell how to try it',
    recommendation: 'Put the minimal install and first-run commands near the hero.',
    test: (_raw, { readme }) => {
      const first = firstSuccessCommand(readme);
      return {
        status: first && first.line <= 40 ? 'yes' : first ? 'partly' : 'no',
        evidence: first
          ? `First-success command appears at line ${first.line}.`
          : 'No runnable first-success command was detected.',
      };
    },
  }),
  metricRule({
    id: 'impression.trust',
    title: 'Trust signals are not visible',
    recommendation:
      'Expose accurate license, testing/CI, release, or limitation information without adding decorative badge noise.',
    test: (_raw, { readme }) => {
      const openingLines = readme.raw.split(/\r?\n/).slice(0, 60);
      const opening = openingLines.join('\n');
      const visibleSignals = [
        {
          name: 'license',
          present:
            /(?:^|\n)\s{0,3}(?:#{1,6}\s+)?license\b|\blicensed under\b|\blicense:\s*(?:mit|apache|bsd|mpl|gpl|isc)/i.test(
              opening,
            ),
        },
        {
          name: 'tests/CI',
          present:
            /(?:github\.com\/[^\s)]+\/actions\/workflows|\b(?:build|tests?|ci)\s*(?:status|passing|badge)|\btested (?:on|with|against)\b)/i.test(
              opening,
            ),
        },
        {
          name: 'release/limitations',
          present:
            /(?:^|\n)\s{0,3}(?:#{1,6}\s+)?(?:releases?|changelog|limitations?|known issues?|security)\b/i.test(
              opening,
            ),
        },
      ];
      const detected = visibleSignals
        .filter((signal) => signal.present)
        .map((signal) => signal.name);
      return {
        status: detected.length >= 2 ? 'yes' : detected.length === 1 ? 'partly' : 'no',
        evidence: detected.length
          ? `${detected.length} README-visible trust signal(s) appear in the first 60 lines: ${detected.join(', ')}.`
          : 'No explicit license, test/CI, release, security, or limitation signal is visible in the first 60 lines.',
      };
    },
  }),
];
