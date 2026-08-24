import { commandExistsRule } from '../analyzers/commands/rule.js';
import { licenseRule } from '../analyzers/license/rule.js';
import { relativeLinkRule } from '../analyzers/links/rule.js';
import { externalLinkRule } from '../analyzers/links/external-rule.js';
import { metadataParseRule } from '../analyzers/metadata/rule.js';
import { packageNameRule } from '../analyzers/package/rule.js';
import { packageManagerRule } from '../analyzers/package-manager/rule.js';
import { runtimeRule } from '../analyzers/runtime/rule.js';
import { heroExplanationRule } from '../analyzers/hero/rules.js';
import { structureRule } from '../analyzers/structure/rule.js';
import {
  quickStartRule,
  firstCommandRule,
  expectedOutputRule,
} from '../analyzers/onboarding/rules.js';
import { demoPlacementRule, demoPresenceRule } from '../analyzers/visuals/rules.js';
import { badgeRule } from '../analyzers/badges/rule.js';
import { completenessRule } from '../analyzers/completeness/rule.js';
import { trustLicenseRule, trustSignalsRule } from '../analyzers/trust/rules.js';
import { impressionRules } from '../analyzers/impression/rules.js';
import type { Rule } from './types.js';

const BUILTIN_RULES: readonly Rule[] = Object.freeze(
  [
    commandExistsRule,
    relativeLinkRule,
    externalLinkRule,
    metadataParseRule,
    packageNameRule,
    packageManagerRule,
    runtimeRule,
    licenseRule,
    heroExplanationRule,
    structureRule,
    quickStartRule,
    firstCommandRule,
    expectedOutputRule,
    demoPresenceRule,
    demoPlacementRule,
    badgeRule,
    completenessRule,
    trustLicenseRule,
    trustSignalsRule,
    ...impressionRules,
  ].map((rule) => Object.freeze(rule)),
);

export function createBuiltinRules(): Rule[] {
  return [...BUILTIN_RULES];
}
