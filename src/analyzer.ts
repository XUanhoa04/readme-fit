import { analyzeRepository, type AnalysisOptions } from './core/analysis.js';
import type { AnalysisReport } from './models/index.js';
import { createBuiltinRules } from './rules/builtin.js';
import { RuleRegistry, type RulePack } from './rules/registry.js';
import type { Rule } from './rules/types.js';

export interface AnalyzerOptions {
  includeBuiltin?: boolean;
  rules?: readonly Rule[];
  rulePacks?: readonly RulePack[];
}

export class Analyzer {
  readonly #registry: RuleRegistry;

  constructor(options: AnalyzerOptions = {}) {
    this.#registry = new RuleRegistry();
    if (options.includeBuiltin !== false) {
      this.#registry.addPack({ name: 'readme-fit/builtin', rules: createBuiltinRules() });
    }
    for (const pack of options.rulePacks ?? []) this.#registry.addPack(pack);
    for (const rule of options.rules ?? []) this.#registry.add(rule);
  }

  analyze(root: string, options: AnalysisOptions = {}): Promise<AnalysisReport> {
    return analyzeRepository(root, options, this.#registry.rules());
  }

  rules(): readonly Rule[] {
    return this.#registry.rules();
  }

  explain(ruleId: string): Rule | undefined {
    return this.#registry.explain(ruleId);
  }
}

export function createAnalyzer(options: AnalyzerOptions = {}): Analyzer {
  return new Analyzer(options);
}
