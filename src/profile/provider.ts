import type { PublicProfileData } from '../models/index.js';

export interface ProfileProvider {
  getProfile(username: string): Promise<PublicProfileData>;
}
