/**
 * Achievement / badge definitions for the profile.
 *
 * Lives in its own module (rather than inside ProfileCard) so both the parent
 * component and the extracted AchievementsTab can import it without a circular
 * dependency.
 */

/**
 * All constellations for the "Gotta Catch 'Em All" badge
 * (excluding Prime, which is a 1-of-1).
 */
export const COLLECTIBLE_CONSTELLATIONS = [
  'aether', 'spectra', 'solveil', 'nebulu', 'chroma',
  'rose', 'monflare', 'auracore', 'parallel'
] as const;

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  check: (data: AchievementCheckData) => boolean;
}

export interface AchievementCheckData {
  starCount: number;
  uniqueConstellations: string[];
  constellationCounts: Record<string, number>;
  hasPrime: boolean;
  level: number;
}

/**
 * Available achievements
 */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'star_forged',
    name: 'Star Forged',
    description: 'Hold at least 1 Star Skrumpey',
    icon: '⭐',
    color: '#9966ff',
    check: (data) => data.starCount >= 1,
  },
  {
    id: 'cosmic_warden',
    name: 'Cosmic Warden',
    description: 'Hold 2 or more Star Skrumpeys',
    icon: '🌟',
    color: '#00ffff',
    check: (data) => data.starCount >= 2,
  },
  {
    id: 'star_lord',
    name: 'Star Lord',
    description: 'Hold 5 or more Star Skrumpeys',
    icon: '👑',
    color: '#ff00ff',
    check: (data) => data.starCount >= 5,
  },
  {
    id: 'cosmic_emperor',
    name: 'Cosmic Emperor',
    description: 'Hold 10 or more Star Skrumpeys',
    icon: '🏆',
    color: '#ffd700',
    check: (data) => data.starCount >= 10,
  },
  {
    id: 'gotta_catch_em_all',
    name: 'Gotta Catch Em All!',
    description: 'Collect all 9 constellation types (excluding Prime)',
    icon: '🔮',
    color: '#ff6ec7',
    check: (data) => {
      const collected = COLLECTIBLE_CONSTELLATIONS.filter(c =>
        data.uniqueConstellations.includes(c)
      );
      return collected.length >= COLLECTIBLE_CONSTELLATIONS.length;
    },
  },
  {
    id: 'prime_holder',
    name: 'The Prime',
    description: 'Hold the legendary 1/1 Prime Star Skrumpey',
    icon: '💎',
    color: '#ffd700',
    check: (data) => data.hasPrime,
  },
  {
    id: 'constellation_explorer',
    name: 'Constellation Explorer',
    description: 'Collect at least 3 different constellation types',
    icon: '🔭',
    color: '#9966ff',
    check: (data) => data.uniqueConstellations.length >= 3,
  },
  {
    id: 'cosmic_collector',
    name: 'Cosmic Collector',
    description: 'Collect at least 5 different constellation types',
    icon: '🌌',
    color: '#44ff88',
    check: (data) => data.uniqueConstellations.length >= 5,
  },
  {
    id: 'constellation_master',
    name: 'Constellation Master',
    description: 'Hold 3 or more Star Skrumpeys of the same constellation',
    icon: '✨',
    color: '#ff6ec7',
    check: (data) => Object.values(data.constellationCounts).some(count => count >= 3),
  },
];
