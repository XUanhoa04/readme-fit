import { commandExistsRule } from '../analyzers/commands/rule.js';
import { licenseRule } from '../analyzers/license/rule.js';
import { relativeLinkRule } from '../analyzers/links/rule.js';
import { packageNameRule } from '../analyzers/package/rule.js';
import { runtimeRule } from '../analyzers/runtime/rule.js';
import { heroExplanationRule } from '../analyzers/hero/rules.js';
import { structureRule } from '../analyzers/structure/rule.js';
import { quickStartRule, firstCommandRule, expectedOutputRule } from '../analyzers/onboarding/rules.js';
import { demoPlacementRule, demoPresenceRule } from '../analyzers/visuals/rules.js';
import { badgeRule } from '../analyzers/badges/rule.js';
import { completenessRule } from '../analyzers/completeness/rule.js';
import { trustLicenseRule, trustSignalsRule } from '../analyzers/trust/rules.js';
import { impressionRules } from '../analyzers/impression/rules.js';
import { registerRule } from './registry.js';

for (const rule of [
  commandExistsRule, relativeLinkRule, packageNameRule, runtimeRule, licenseRule,
  heroExplanationRule, structureRule, quickStartRule, firstCommandRule, expectedOutputRule,
  demoPresenceRule, demoPlacementRule, badgeRule, completenessRule, trustLicenseRule,
  trustSignalsRule, ...impressionRules,
]) {
  registerRule(rule);
}
