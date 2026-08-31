/**
 * Rules profile. Everything here is locked by docs/HKOS_RULES.md; the profile
 * only exposes the variations the PRD actually ships.
 */

export type MinimumFaanProfile = 'beginner' | 'standard' | 'classic';
export type MatchLength = 'single-hand' | 'east-round' | 'four-rounds';

export interface RulesProfile {
  /** 144 includes flowers and seasons, 136 does not. §2.1 */
  tileSet: 144 | 136;
  /** Minimum *qualifying* faan: beginner 0, standard 1, classic 3. §7.4 */
  minimumFaan: MinimumFaanProfile;
  matchLength: MatchLength;
}

export const MINIMUM_FAAN: Record<MinimumFaanProfile, number> = {
  beginner: 0,
  standard: 1,
  classic: 3,
};

/** §7.2. Not a user-facing setting in V1. */
export const FAAN_CEILING = 13;

export const DEFAULT_PROFILE: RulesProfile = {
  tileSet: 144,
  minimumFaan: 'standard',
  matchLength: 'east-round',
};

export function minimumFaanOf(profile: RulesProfile): number {
  return MINIMUM_FAAN[profile.minimumFaan];
}

export function normaliseProfile(partial?: Partial<RulesProfile>): RulesProfile {
  return { ...DEFAULT_PROFILE, ...partial };
}
