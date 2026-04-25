// V3 NPC + zone identity. Positions live in the Tiled JSON map at
// public/sanctuary-v3/maps/overworld.json (object layer 'npcs'); the x/y
// values here are placeholders only — WorldSceneV3 overrides them from the
// map. This file is the canonical source for NPC display name + dialogue.

export type BuildingId =
  | 'hot-springs'
  | 'observatory'
  | 'training-grounds'
  | 'star-garden'
  | 'cosmic-library'
  | 'nebula-kitchen'
  | 'dream-hollow'
  | 'aura-forge';

export const BUILDING_IDS: readonly BuildingId[] = [
  'observatory', 'cosmic-library', 'star-garden', 'hot-springs',
  'training-grounds', 'dream-hollow', 'nebula-kitchen', 'aura-forge',
] as const;

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
  x: number;
  y: number;
  zone: BuildingId | 'spawn';
  dialogue: string;
}

export const NPCS_V3: NPCDefV3[] = [
  { id: 'spawn-fox',         name: 'Spawn Fox',  x: 0, y: 0, zone: 'spawn',             dialogue: 'Welcome to the Sanctuary, traveler.' },
  { id: 'observatory-owl',   name: 'Astris',     x: 0, y: 0, zone: 'observatory',       dialogue: 'The stars whisper secrets.' },
  { id: 'library-moth',      name: 'Lorekeeper', x: 0, y: 0, zone: 'cosmic-library',    dialogue: 'Knowledge is the oldest power.' },
  { id: 'garden-ent',        name: 'Flora',      x: 0, y: 0, zone: 'star-garden',       dialogue: 'Every star seed needs patience.' },
  { id: 'springs-duck',      name: 'Ember',      x: 0, y: 0, zone: 'hot-springs',       dialogue: 'The waters reveal hidden truths.' },
  { id: 'training-wolf',     name: 'Valor',      x: 0, y: 0, zone: 'training-grounds',  dialogue: 'Strength is forged through perseverance.' },
  { id: 'dream-sheep',       name: 'Somnia',     x: 0, y: 0, zone: 'dream-hollow',      dialogue: 'Dreams shape reality.' },
  { id: 'kitchen-bunny',     name: 'Chef Cosmo', x: 0, y: 0, zone: 'nebula-kitchen',    dialogue: 'Cosmic cuisine fuels the soul.' },
  { id: 'forge-golem',       name: 'Pyrix',      x: 0, y: 0, zone: 'aura-forge',        dialogue: 'Auras are shaped in fire.' },
];

export function npcSpriteKey(id: NPCSheet): string {
  return `npc-v3-${id}`;
}
