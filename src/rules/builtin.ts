import { commandExistsRule } from '../analyzers/commands/rule.js';
import { licenseRule } from '../analyzers/license/rule.js';
import { relativeLinkRule } from '../analyzers/links/rule.js';
import { packageNameRule } from '../analyzers/package/rule.js';
import { runtimeRule } from '../analyzers/runtime/rule.js';
import { registerRule } from './registry.js';

for (const rule of [commandExistsRule, relativeLinkRule, packageNameRule, runtimeRule, licenseRule]) {
  registerRule(rule);
}
