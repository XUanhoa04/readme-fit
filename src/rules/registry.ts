import type { Rule } from './types.js';

const rules: Rule[] = [];

export function registerRule(rule: Rule): void {
  if (rules.some((candidate) => candidate.id === rule.id)) throw new Error(`Duplicate rule: ${rule.id}`);
  rules.push(rule);
}

export function getRules(): readonly Rule[] {
  return rules;
}

export function explainRule(id: string): Rule | undefined {
  return rules.find((rule) => rule.id === id);
}
