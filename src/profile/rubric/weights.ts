import type { ProfileCategory } from '../../models/index.js';

export const PROFILE_MAX: Record<ProfileCategory, number> = {
  positioning: 20,
  'proof-of-work': 25,
  'project-selection': 20,
  scanability: 15,
  'technical-narrative': 15,
  contact: 5,
};
