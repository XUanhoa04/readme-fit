export { analyzeRepository } from './core/analysis.js';
export { Analyzer, createAnalyzer } from './analyzer.js';
export {
  RuleRegistry,
  defineRule,
  defineRulePack,
  type RulePack,
} from './rules/registry.js';
export type { Rule, RuleResult, AnalysisContext } from './rules/types.js';
export { createBuiltinRules } from './rules/builtin.js';
export { parseReadme } from './core/markdown/parser.js';
export { inspectRepository } from './core/repository/inspector.js';
export { classifyProject } from './classifiers/project-type/classifier.js';
export { analyzeProfile, analyzeProfileData } from './profile/analyzer/analyze-profile.js';
export { GitHubProfileProvider } from './profile/github/github-provider.js';
export {
  compareBaseline,
  createBaseline,
  findingFingerprint,
  loadBaseline,
  parseBaseline,
} from './core/baseline.js';
export type * from './models/index.js';
export type { ProfileProvider } from './profile/provider.js';
export { VERSION } from './version.js';
