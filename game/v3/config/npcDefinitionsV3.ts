import { BUILDINGS, TILE, type BuildingId } from './worldLayoutV3';

export type NPCSheet =
  | 'spawn-fox'
  | 'springs-duck'
  | 'observatory-owl'
  | 'training-wolf'
  | 'kitchen-bunny'
  | 'garden-ent'
  | 'dream-sheep'
  | 'library-moth'
  | 'forge-golem'
  | 'quest-board-spirit';

export interface NPCDefV3 {
  id: NPCSheet;
  name: string;
  /** centre x, y in world pixels. */
  x: number;
  y: number;
  zone: BuildingId | 'spawn';
  dialogue: string;
}

function near(buildingId: BuildingId, dx: number, dy: number) {
  const b = BUILDINGS.find(b => b.id === buildingId)!;
  return { x: b.x + dx, y: b.y + dy };
}

export const NPCS_V3: NPCDefV3[] = [
  {
    id: 'spawn-fox',
    name: 'Spawn Fox',
    ...{ x: 20 * TILE, y: 14 * TILE },
    zone: 'spawn',
    dialogue: 'Welcome to the Sanctuary, traveler.',
  },
  { id: 'observatory-owl',   name: 'Astris',     ...near('observatory',      48, 80),  zone: 'observatory',      dialogue: 'The stars whisper secrets.' },
  { id: 'library-moth',      name: 'Lorekeeper', ...near('cosmic-library',   48, 80),  zone: 'cosmic-library',   dialogue: 'Knowledge is the oldest power.' },
  { id: 'garden-ent',        name: 'Flora',      ...near('star-garden',      48, 80),  zone: 'star-garden',      dialogue: 'Every star seed needs patience.' },
  { id: 'springs-duck',      name: 'Ember',      ...near('hot-springs',      48, 80),  zone: 'hot-springs',      dialogue: 'The waters reveal hidden truths.' },
  { id: 'training-wolf',     name: 'Valor',      ...near('training-grounds', 48, -80), zone: 'training-grounds', dialogue: 'Strength is forged through perseverance.' },
  { id: 'dream-sheep',       name: 'Somnia',     ...near('dream-hollow',     48, -80), zone: 'dream-hollow',     dialogue: 'Dreams shape reality.' },
  { id: 'kitchen-bunny',     name: 'Chef Cosmo', ...near('nebula-kitchen',   48, -80), zone: 'nebula-kitchen',   dialogue: 'Cosmic cuisine fuels the soul.' },
  { id: 'forge-golem',       name: 'Pyrix',      ...near('aura-forge',       48, -80), zone: 'aura-forge',       dialogue: 'Auras are shaped in fire.' },
];

export function npcSpriteKey(id: NPCSheet): string {
  return `npc-v3-${id}`;
}
