import { WORLD_WIDTH, WORLD_HEIGHT } from './worldLayout';

export interface NPCDefinition {
  id: string;
  name: string;
  x: number;
  y: number;
  zone: string;
  dialogue: string;
  spriteColor: number;
}

export const NPC_DEFINITIONS: NPCDefinition[] = [
  {
    id: 'quest-board',
    name: 'Quest Board',
    x: Math.round(0.5 * WORLD_WIDTH),
    y: Math.round(0.48 * WORLD_HEIGHT) + 80,
    zone: 'Town Square',
    dialogue: 'View all available quests.',
    spriteColor: 0xffd700,
  },
  {
    id: 'npc-hot-springs',
    name: 'Ember',
    x: Math.round(0.2 * WORLD_WIDTH) + 30,
    y: Math.round(0.3 * WORLD_HEIGHT) + 20,
    zone: 'Hot Springs',
    dialogue: 'The warm waters reveal hidden truths...',
    spriteColor: 0xff6644,
  },
  {
    id: 'npc-training-grounds',
    name: 'Valor',
    x: Math.round(0.7 * WORLD_WIDTH) + 30,
    y: Math.round(0.2 * WORLD_HEIGHT) + 20,
    zone: 'Training Grounds',
    dialogue: 'Strength is forged through perseverance.',
    spriteColor: 0x44aaff,
  },
  {
    id: 'npc-dream-hollow',
    name: 'Somnia',
    x: Math.round(0.1 * WORLD_WIDTH) + 30,
    y: Math.round(0.8 * WORLD_HEIGHT) + 20,
    zone: 'Dream Hollow',
    dialogue: 'Dreams shape reality, if you let them...',
    spriteColor: 0xcc66ff,
  },
  {
    id: 'npc-star-garden',
    name: 'Flora',
    x: Math.round(0.5 * WORLD_WIDTH) + 30,
    y: Math.round(0.5 * WORLD_HEIGHT) + 20,
    zone: 'Star Garden',
    dialogue: 'Every star seed needs patience to bloom.',
    spriteColor: 0x66ff88,
  },
  {
    id: 'npc-nebula-kitchen',
    name: 'Chef Cosmo',
    x: Math.round(0.3 * WORLD_WIDTH) + 30,
    y: Math.round(0.7 * WORLD_HEIGHT) + 20,
    zone: 'Nebula Kitchen',
    dialogue: 'Cosmic cuisine fuels the soul!',
    spriteColor: 0xffaa44,
  },
  {
    id: 'npc-cosmic-library',
    name: 'Lorekeeper',
    x: Math.round(0.8 * WORLD_WIDTH) + 30,
    y: Math.round(0.6 * WORLD_HEIGHT) + 20,
    zone: 'Cosmic Library',
    dialogue: 'Knowledge is the oldest form of power.',
    spriteColor: 0x8866ff,
  },
  {
    id: 'npc-observatory',
    name: 'Astris',
    x: Math.round(0.5 * WORLD_WIDTH) + 30,
    y: Math.round(0.1 * WORLD_HEIGHT) + 20,
    zone: 'Observatory',
    dialogue: 'The stars whisper secrets to those who listen.',
    spriteColor: 0xffffaa,
  },
  {
    id: 'npc-aura-forge',
    name: 'Pyrix',
    x: Math.round(0.9 * WORLD_WIDTH) + 30,
    y: Math.round(0.4 * WORLD_HEIGHT) + 20,
    zone: 'Aura Forge',
    dialogue: 'Auras are shaped in fire and will.',
    spriteColor: 0xff4466,
  },
];
