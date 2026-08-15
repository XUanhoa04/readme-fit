import { parseReadme } from '../../core/markdown/parser.js';
import type {
  Finding,
  ProfileCategory,
  ProfileReport,
  ProfileScore,
  PublicProfileData,
  PublicRepository,
  RuleScore,
} from '../../models/index.js';
import { finding } from '../../rules/helpers.js';
import type { ProfileProvider } from '../provider.js';
import { PROFILE_MAX } from '../rubric/weights.js';

function score(category: ProfileCategory, earned: number, explanation: string): ProfileScore {
  const maxScore = PROFILE_MAX[category];
  const value = Math.max(0, Math.min(maxScore, earned));
  const rule: RuleScore = {
    id: `profile.${category}`,
    status: value >= maxScore * 0.7 ? 'pass' : 'fail',
    weight: maxScore,
    earned: value,
    explanation,
  };
  return { category, score: value, maxScore, rules: [rule] };
}

const GENERIC_TOPICS = new Set(['javascript', 'typescript', 'python', 'java', 'go', 'react', 'nodejs', 'css', 'html']);

function extractThemes(repositories: PublicRepository[]): Array<{ theme: string; repositories: number }> {
  const counts = new Map<string, number>();
  for (const repository of repositories.filter((item) => !item.fork && !item.archived)) {
    const phrases = [
      ...repository.topics.filter((topic) => !GENERIC_TOPICS.has(topic.toLowerCase())),
      ...(repository.description?.toLowerCase().match(/\b(?:developer tool(?:ing)?|observability|aiops|data engineering|machine learning|cli|automation|open source|security|documentation|api)\b/g) ?? []),
    ];
    for (const phrase of new Set(phrases)) counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([theme, repositories]) => ({ theme, repositories }));
}

function technologyIconCount(readme: string): number {
  return [...readme.matchAll(/(?:devicon|simple-icons|skillicons|cdn\.jsdelivr\.net\/gh\/devicons)/gi)].length;
}

export function analyzeProfileData(data: PublicProfileData): ProfileReport {
  const readme = data.profileReadme ? parseReadme(data.profileReadme, `${data.login}/${data.login}/README.md`) : null;
  const original = data.repositories.filter((repository) => !repository.fork && !repository.archived);
  const described = original.filter((repository) => Boolean(repository.description));
  const topical = original.filter((repository) => repository.topics.length > 0);
  const repoLinks = readme?.links.filter((link) => /github\.com\/[^/]+\/[^/#]+/i.test(link.url)).length ?? 0;
  const themes = extractThemes(original);
  const icons = technologyIconCount(data.profileReadme ?? '');
  const findings: Finding[] = [];

  const positioningEarned = Math.min(20, Number(Boolean(data.bio)) * 8 + Number(Boolean(readme && readme.wordCount >= 12)) * 7 + Number(readme?.headings.length) * 5);
  if (positioningEarned < 14) findings.push(finding({
    id: 'profile.positioning', category: 'profile', severity: 'high', priority: 'P1', confidence: 'medium', deterministic: false,
    title: 'Public positioning is difficult to identify', observation: `The public bio is ${data.bio ? 'present' : 'absent'} and the profile README is ${readme ? `${readme.wordCount} words` : 'absent'}.`,
    impact: 'A visitor has limited evidence for understanding the focus of the public profile.',
    recommendation: 'Lead with one specific line describing the work this profile intends to demonstrate.', evidence: [{ type: 'public-bio', message: data.bio ?? 'not present' }, { type: 'profile-readme', message: readme ? `${readme.wordCount} words` : 'not present' }],
  }));

  const proofEarned = Math.min(25, Math.round(Math.min(original.length, 6) / 6 * 10 + Math.min(described.length, 5) / 5 * 8 + Math.min(repoLinks, 3) / 3 * 7));
  if (proofEarned < 18) findings.push(finding({
    id: 'profile.proof-of-work', category: 'profile', severity: 'medium', priority: 'P1', confidence: 'medium', deterministic: false,
    title: 'Proof of work is under-explained', observation: `${original.length} original public repositories were inspected; ${described.length} have descriptions and ${repoLinks} repository links appear in the profile README.`,
    impact: 'Strong work may exist publicly but remain difficult to discover from the profile landing page.',
    recommendation: 'Introduce two or three flagship repositories with the problem, outcome, and evidence—not only technology labels.', evidence: [{ type: 'repository-summary', message: `${original.length} original, ${described.length} described`, value: { original: original.length, described: described.length, repoLinks } }],
  }));

  const selectionEarned = Math.min(20, Math.round(Math.min(repoLinks, 4) / 4 * 12 + Math.min(topical.length, 4) / 4 * 8));
  const headingCount = readme?.headings.length ?? 0;
  const scanabilityEarned = readme ? Math.max(3, Math.min(15, 8 + Math.min(headingCount, 4) * 2 - Number(readme.wordCount > 1000) * 3)) : 0;
  const narrativeEarned = Math.min(15, themes.length * 2 + Math.min(described.length, 5));
  const contactEarned = data.blog || readme?.links.some((link) => /mailto:|linkedin\.com|bsky\.app|x\.com\//i.test(link.url)) ? 5 : 0;

  if (icons >= 12 && repoLinks < 3) findings.push(finding({
    id: 'profile.skill-wall', category: 'profile', severity: 'medium', priority: 'P2', confidence: 'medium', deterministic: false,
    title: 'Technology icons outweigh project evidence', observation: `${icons} technology-icon references were detected, while only ${repoLinks} repository links appear in the profile README.`,
    impact: 'The profile allocates more visible space to claimed technologies than to inspectable proof of work.',
    recommendation: 'Lead with flagship projects and move the selected technology list below the evidence.', evidence: [{ type: 'technology-icons', message: `${icons} icon references`, value: icons }, { type: 'profile-repository-links', message: `${repoLinks} repository links`, value: repoLinks }],
  }));

  if (contactEarned === 0) findings.push(finding({
    id: 'profile.contact', category: 'profile', severity: 'low', priority: 'P3', confidence: 'high',
    title: 'No clear next step or contact path', observation: 'No public website or recognizable contact/social link was found in the inspected profile data.',
    impact: 'Interested visitors lack an obvious next action.', recommendation: 'Add one maintained contact or portfolio link.',
    evidence: [{ type: 'profile-contact', message: 'No public contact path detected' }],
  }));

  const scores: Record<ProfileCategory, ProfileScore> = {
    positioning: score('positioning', positioningEarned, 'Bio, profile README substance, and hierarchy.'),
    'proof-of-work': score('proof-of-work', proofEarned, 'Original repositories, descriptions, and profile links.'),
    'project-selection': score('project-selection', selectionEarned, 'Repository selection and topical context visible from the profile.'),
    scanability: score('scanability', scanabilityEarned, 'Profile README hierarchy and length.'),
    'technical-narrative': score('technical-narrative', narrativeEarned, 'Recurring public repository topics and descriptions.'),
    contact: score('contact', contactEarned, 'Visible public next step.'),
  };
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    user: { login: data.login, name: data.name, url: data.url },
    scores,
    total: Object.values(scores).reduce((sum, item) => sum + item.score, 0),
    findings,
    facts: {
      visibleRepositoryThemes: themes,
      repositoriesInspected: data.repositories.length,
      originalRepositories: original.length,
      repositoriesWithDescriptions: described.length,
      repositoriesWithTopics: topical.length,
      profileReadmePresent: Boolean(readme),
      technologyIconReferences: icons,
      profileRepositoryLinks: repoLinks,
      pinnedRepositories: 'not_checked',
    },
    limitations: [
      'Pinned repositories are not available from the public REST endpoint and were not checked.',
      'Repository contents beyond public descriptions and topics were not analyzed in this deterministic pass.',
      'Private activity, professional experience, and real-world ability are outside scope.',
    ],
    disclaimer: 'This report describes what the public GitHub profile visibly demonstrates. It does not measure the person’s actual skills, identity, or professional experience.',
  };
}

export async function analyzeProfile(username: string, provider: ProfileProvider): Promise<ProfileReport> {
  return analyzeProfileData(await provider.getProfile(username));
}
