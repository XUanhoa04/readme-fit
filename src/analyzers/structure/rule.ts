import type { Rule } from '../../rules/types.js';
import { failScore, finding, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

export const structureRule: Rule = {
  id: 'structure.hierarchy',
  category: 'clarity',
  description: 'Reports basic H1 count, skipped heading levels, duplicate titles, and empty sections.',
  applies: () => true,
  evaluate: ({ readme, project }) => {
    const h1 = readme.headings.filter((heading) => heading.depth === 1);
    const skipped = readme.headings.filter((heading, index) => index > 0 && heading.depth > (readme.headings[index - 1]?.depth ?? 0) + 1);
    const normalized = readme.headings.map((heading) => heading.text.trim().toLowerCase());
    const duplicates = [...new Set(normalized.filter((title, index) => normalized.indexOf(title) !== index))];
    const empty = readme.sections.filter((section) => section.wordCount === 0);
    const issues = (h1.length === 1 ? 0 : 1) + skipped.length + duplicates.length + empty.length;
    const evidence = [
      { type: 'h1-count', message: `${h1.length} H1 headings`, path: readme.path, value: h1.length },
      { type: 'heading-skips', message: `${skipped.length} skipped levels`, path: readme.path, value: skipped },
      { type: 'duplicate-headings', message: `${duplicates.length} duplicate titles`, path: readme.path, value: duplicates },
      { type: 'empty-sections', message: `${empty.length} empty sections`, path: readme.path, value: empty.map((section) => section.heading.text) },
    ];
    return {
      score: issues ? failScore('structure.hierarchy', ruleWeight('structure.hierarchy', project.primaryType), Math.max(0, 5 - issues), `${issues} structural hygiene issue(s).`) : passScore('structure.hierarchy', ruleWeight('structure.hierarchy', project.primaryType), 'Heading structure is coherent.'),
      findings: issues ? [finding({
        id: 'structure.hierarchy', category: 'clarity', severity: 'low', priority: 'P3', title: 'README heading structure needs cleanup',
        observation: `${h1.length} H1 heading(s), ${skipped.length} skipped level(s), ${duplicates.length} duplicate title(s), and ${empty.length} empty section(s) were found.`,
        impact: 'Structural inconsistencies make scanning and generated navigation less predictable.',
        recommendation: 'Use one H1, a sequential heading hierarchy, unique section titles, and remove empty sections.', evidence,
      })] : [],
      facts: { structure: { h1Count: h1.length, skippedHeadings: skipped.length, duplicateHeadings: duplicates, emptySections: empty.length } },
    };
  },
};
