// Shared types and constants for the members analytics cluster.
// Extracted from MembersContent.tsx as part of the analytics split.

export interface HolderStatsData {
  constellation: string;
  currentHolders: number;
  history: Array<{
    timestamp: number;
    holderCount: number;
  }>;
  lastUpdated: string;
}

// All constellation options for dropdown
export const CONSTELLATION_OPTIONS = [
  { value: 'all', label: 'All Constellations' },
  { value: 'aether', label: 'Aether' },
  { value: 'spectra', label: 'Spectra' },
  { value: 'solveil', label: 'Solveil' },
  { value: 'nebulu', label: 'Nebulu' },
  { value: 'chroma', label: 'Chroma' },
  { value: 'rose', label: 'Rose' },
  { value: 'monflare', label: 'Monflare' },
  { value: 'auracore', label: 'Auracore' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'prime', label: 'Prime' },
] as const;
