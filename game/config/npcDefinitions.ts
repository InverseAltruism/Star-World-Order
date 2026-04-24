import { WORLD_WIDTH, WORLD_HEIGHT, SPAWN } from './worldLayout';

export interface NPCDefinition {
  id: string;
  name: string;
  x: number;
  y: number;
  zone: string;
  dialogue: string;
  spriteColor: number;
  spriteFile?: string;
  kind?: 'quest' | 'intro';
}

export const NPC_DEFINITIONS: NPCDefinition[] = [
  {
    id: 'spawn-fox',
    name: 'Spawn Fox',
    x: SPAWN.x + 32,
    y: SPAWN.y,
    zone: 'Town Square',
    dialogue: 'Welcome to the Sanctuary, traveler.',
    spriteColor: 0xffd700,
    spriteFile: 'Spawn_Fox_Sprite.png',
    kind: 'intro',
  },
  {
    id: 'npc-hot-springs',
    name: 'Ember',
    x: Math.round(0.2 * WORLD_WIDTH) + 30,
    y: Math.round(0.3 * WORLD_HEIGHT) + 20,
    zone: 'Hot Springs',
    dialogue: 'The warm waters reveal hidden truths...',
    spriteColor: 0xff6644,
    spriteFile: 'Springs_Duck_Sprite.png',
  },
  {
    id: 'npc-training-grounds',
    name: 'Valor',
    x: Math.round(0.7 * WORLD_WIDTH) + 30,
    y: Math.round(0.2 * WORLD_HEIGHT) + 20,
    zone: 'Training Grounds',
    dialogue: 'Strength is forged through perseverance.',
    spriteColor: 0x44aaff,
    spriteFile: 'Training_Wolf_Sprite.png',
  },
  {
    id: 'npc-dream-hollow',
    name: 'Somnia',
    x: Math.round(0.1 * WORLD_WIDTH) + 30,
    y: Math.round(0.8 * WORLD_HEIGHT) + 20,
    zone: 'Dream Hollow',
    dialogue: 'Dreams shape reality, if you let them...',
    spriteColor: 0xcc66ff,
    spriteFile: 'Dream_Sheep_Sprite.png',
  },
  {
    id: 'npc-star-garden',
    name: 'Flora',
    x: Math.round(0.5 * WORLD_WIDTH) + 30,
    y: Math.round(0.5 * WORLD_HEIGHT) + 20,
    zone: 'Star Garden',
    dialogue: 'Every star seed needs patience to bloom.',
    spriteColor: 0x66ff88,
    spriteFile: 'Garden_Ent_Sprite.png',
  },
  {
    id: 'npc-nebula-kitchen',
    name: 'Chef Cosmo',
    x: Math.round(0.3 * WORLD_WIDTH) + 30,
    y: Math.round(0.7 * WORLD_HEIGHT) + 20,
    zone: 'Nebula Kitchen',
    dialogue: 'Cosmic cuisine fuels the soul!',
    spriteColor: 0xffaa44,
    spriteFile: 'Kitchen_Bunny_Sprite.png',
  },
  {
    id: 'npc-cosmic-library',
    name: 'Lorekeeper',
    x: Math.round(0.8 * WORLD_WIDTH) + 30,
    y: Math.round(0.6 * WORLD_HEIGHT) + 20,
    zone: 'Cosmic Library',
    dialogue: 'Knowledge is the oldest form of power.',
    spriteColor: 0x8866ff,
    spriteFile: 'Hollow_moth_Sprite.png',
  },
  {
    id: 'npc-observatory',
    name: 'Astris',
    x: Math.round(0.5 * WORLD_WIDTH) + 30,
    y: Math.round(0.1 * WORLD_HEIGHT) + 20,
    zone: 'Observatory',
    dialogue: 'The stars whisper secrets to those who listen.',
    spriteColor: 0xffffaa,
    spriteFile: 'Observatory_Owl_Sprite.png',
  },
  {
    id: 'npc-aura-forge',
    name: 'Pyrix',
    x: Math.round(0.9 * WORLD_WIDTH) + 30,
    y: Math.round(0.4 * WORLD_HEIGHT) + 20,
    zone: 'Aura Forge',
    dialogue: 'Auras are shaped in fire and will.',
    spriteColor: 0xff4466,
    spriteFile: 'Aura_Golem_Sprite.png',
  },
];

export function npcSpriteTextureKey(id: string): string {
  return `npc-sprite-${id}`;
}
