import type { ProjectType } from '../models/index.js';

export type ScoringPreset = 'minimal' | 'balanced' | 'oss' | 'portfolio';

const BASE_WEIGHTS: Record<string, number> = {
  'correctness.command.exists': 25,
  'correctness.link.exists': 25,
  'correctness.external-link.reachable': 10,
  'correctness.metadata.parseable': 15,
  'correctness.package-name.matches': 20,
  'correctness.runtime.matches': 15,
  'correctness.license.matches': 15,
  'structure.h1': 10,
  'structure.hierarchy': 5,
  'hero.explanation.present': 25,
  'onboarding.quick-start.present': 30,
  'onboarding.first-command.early': 25,
  'onboarding.expected-output.present': 20,
  'visual.demo.present': 20,
  'visual.demo.placement': 10,
  'trust.license.present': 25,
  'trust.signals.present': 20,
  'trust.badges.signal-to-noise': 10,
  'completeness.project-type': 40,
  'impression.what': 20,
  'impression.why': 20,
  'impression.proof': 20,
  'impression.try': 20,
  'impression.trust': 20,
};

const TYPE_OVERRIDES: Partial<Record<ProjectType, Record<string, number>>> = {
  cli: {
    'onboarding.quick-start.present': 35,
    'onboarding.first-command.early': 30,
    'onboarding.expected-output.present': 25,
    'visual.demo.present': 12,
  },
  library: {
    'onboarding.quick-start.present': 25,
    'onboarding.expected-output.present': 15,
    'visual.demo.present': 0,
    'visual.demo.placement': 0,
  },
  'desktop-app': {
    'visual.demo.present': 35,
    'visual.demo.placement': 15,
  },
  'web-app': {
    'visual.demo.present': 25,
  },
  'ai-model': {
    'visual.demo.present': 5,
  },
};

const PRESET_OVERRIDES: Record<
  Exclude<ScoringPreset, 'balanced'>,
  Record<string, number>
> = {
  minimal: {
    'structure.hierarchy': 2,
    'hero.explanation.present': 15,
    'onboarding.quick-start.present': 35,
    'onboarding.first-command.early': 30,
    'onboarding.expected-output.present': 15,
    'visual.demo.present': 3,
    'visual.demo.placement': 2,
    'trust.license.present': 20,
    'trust.signals.present': 5,
    'trust.badges.signal-to-noise': 2,
    'completeness.project-type': 25,
    'impression.what': 30,
    'impression.why': 10,
    'impression.proof': 5,
    'impression.try': 25,
    'impression.trust': 5,
  },
  oss: {
    'correctness.link.exists': 30,
    'correctness.license.matches': 25,
    'trust.license.present': 35,
    'trust.signals.present': 40,
    'trust.badges.signal-to-noise': 10,
    'completeness.project-type': 50,
  },
  portfolio: {
    'hero.explanation.present': 30,
    'visual.demo.present': 35,
    'visual.demo.placement': 15,
    'impression.what': 25,
    'impression.why': 30,
    'impression.proof': 30,
    'impression.try': 10,
    'impression.trust': 5,
  },
};

export function ruleWeight(
  id: string,
  projectType: ProjectType,
  preset: ScoringPreset = 'balanced',
): number {
  return (
    (preset === 'balanced' ? undefined : PRESET_OVERRIDES[preset][id]) ??
    TYPE_OVERRIDES[projectType]?.[id] ??
    BASE_WEIGHTS[id] ??
    10
  );
}
