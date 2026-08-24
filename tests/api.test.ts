import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAnalyzer } from '../src/analyzer.js';
import { defineRule, defineRulePack, RuleRegistry } from '../src/rules/registry.js';

const customRule = defineRule({
  id: 'custom.readme.present',
  category: 'clarity' as const,
  description: 'Demonstrates an isolated public rule.',
  applies: () => true,
  evaluate: () => ({
    score: {
      id: 'custom.readme.present',
      status: 'pass' as const,
      weight: 10,
      earned: 10,
      explanation: 'README input was available.',
    },
    findings: [],
  }),
});

describe('public analyzer and rule-pack API', () => {
  it('runs a custom rule without mutating the built-in analyzer', async () => {
    const custom = createAnalyzer({ includeBuiltin: false, rules: [customRule] });
    const builtins = createAnalyzer();
    const report = await custom.analyze(path.resolve('fixtures', 'good-cli'));
    expect(custom.rules().map((rule) => rule.id)).toEqual(['custom.readme.present']);
    expect(report.scores.clarity?.rules.map((rule) => rule.id)).toEqual([
      'custom.readme.present',
    ]);
    expect(report.overall).toBe(100);
    expect(builtins.explain('custom.readme.present')).toBeUndefined();
    expect(builtins.rules().length).toBeGreaterThan(10);
  });

  it('composes named packs and rejects collisions deterministically', () => {
    const pack = defineRulePack({ name: 'example', rules: [customRule] });
    const registry = new RuleRegistry([pack]);
    expect(registry.explain(customRule.id)).toBe(customRule);
    expect(() => registry.add(customRule)).toThrow(/Duplicate rule/);
    expect(() => defineRule({ ...customRule, id: 'invalid' })).toThrow(/Invalid rule ID/);
  });
});
