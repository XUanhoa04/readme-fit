import type { Rule } from './types.js';

export interface RulePack {
  name: string;
  rules: readonly Rule[];
}

export function defineRule<T extends Rule>(rule: T): T {
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(rule.id)) {
    throw new Error(`Invalid rule ID: ${rule.id}`);
  }
  return rule;
}

export function defineRulePack(pack: RulePack): RulePack {
  if (!pack.name.trim()) throw new Error('Rule pack name must not be empty.');
  return { name: pack.name, rules: [...pack.rules] };
}

export class RuleRegistry {
  readonly #rules = new Map<string, Rule>();

  constructor(packs: readonly RulePack[] = []) {
    for (const pack of packs) this.addPack(pack);
  }

  add(rule: Rule): this {
    defineRule(rule);
    if (this.#rules.has(rule.id)) throw new Error(`Duplicate rule: ${rule.id}`);
    this.#rules.set(rule.id, rule);
    return this;
  }

  addPack(pack: RulePack): this {
    defineRulePack(pack);
    for (const rule of pack.rules) this.add(rule);
    return this;
  }

  rules(): readonly Rule[] {
    return [...this.#rules.values()];
  }

  explain(id: string): Rule | undefined {
    return this.#rules.get(id);
  }
}
