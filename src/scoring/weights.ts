import type { ProjectType } from '../models/index.js';

const BASE_WEIGHTS: Record<string, number> = {
  'correctness.command.exists': 25,
  'correctness.link.exists': 25,
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

export function ruleWeight(id: string, projectType: ProjectType): number {
  return TYPE_OVERRIDES[projectType]?.[id] ?? BASE_WEIGHTS[id] ?? 10;
}
