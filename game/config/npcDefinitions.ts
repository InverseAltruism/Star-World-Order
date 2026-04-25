import { WORLD_WIDTH, WORLD_HEIGHT, SPAWN, type RoomKey } from './worldLayout';

export interface RoomPlacement {
  room: RoomKey;
  x: number;
  y: number;
}

export interface NPCDefinition {
  id: string;
  name: string;
  x: number;
  y: number;
  zone: string;
  dialogue: string;
  spriteColor: number;
  spriteFile?: string;
  roomPlacement?: RoomPlacement;
  kind?: 'quest' | 'intro' | 'board' | 'minigame';
  minigameId?: string;
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
    id: 'quest-board',
    name: 'Quest Board',
    x: SPAWN.x - 48,
    y: SPAWN.y - 8,
    zone: 'Town Square',
    dialogue: 'Browse quests from every corner of the Sanctuary.',
    spriteColor: 0x00f7ff,
    kind: 'board',
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
    roomPlacement: { room: 'Hot Springs', x: 640, y: 480 },
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
    roomPlacement: { room: 'Training Grounds', x: 800, y: 500 },
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
    roomPlacement: { room: 'Dream Hollow', x: 620, y: 520 },
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
    roomPlacement: { room: 'Star Garden', x: 724, y: 460 },
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
    roomPlacement: { room: 'Nebula Kitchen', x: 680, y: 500 },
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
    roomPlacement: { room: 'Cosmic Library', x: 760, y: 480 },
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
    roomPlacement: { room: 'Observatory', x: 720, y: 440 },
  },
  {
    id: 'npc-observatory-arcade',
    name: 'Star Catch Arcade',
    x: Math.round(0.5 * WORLD_WIDTH) + 30,
    y: Math.round(0.1 * WORLD_HEIGHT) + 50,
    zone: 'Observatory',
    dialogue: 'A retro cabinet flickers. Ready to chase falling stars?',
    spriteColor: 0x00f7ff,
    roomPlacement: { room: 'Observatory', x: 480, y: 480 },
    kind: 'minigame',
    minigameId: 'star-catch',
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
    roomPlacement: { room: 'Aura Forge', x: 780, y: 500 },
  },
  {
    id: 'npc-hot-springs-arcade',
    name: 'Mood Mirror',
    x: Math.round(0.2 * WORLD_WIDTH) + 60,
    y: Math.round(0.3 * WORLD_HEIGHT) + 50,
    zone: 'Hot Springs',
    dialogue: 'Steam shifts and reveals matching moods. Care to flip a few?',
    spriteColor: 0xff66aa,
    roomPlacement: { room: 'Hot Springs', x: 460, y: 500 },
    kind: 'minigame',
    minigameId: 'memory-match',
  },
  {
    id: 'npc-observatory-stars',
    name: 'Constellation Tablet',
    x: Math.round(0.5 * WORLD_WIDTH) + 60,
    y: Math.round(0.1 * WORLD_HEIGHT) + 80,
    zone: 'Observatory',
    dialogue: 'Trace the stars in their sacred order to chart new constellations.',
    spriteColor: 0xffd700,
    roomPlacement: { room: 'Observatory', x: 940, y: 480 },
    kind: 'minigame',
    minigameId: 'star-connect',
  },
  {
    id: 'npc-aura-forge-anvil',
    name: 'Resonance Anvil',
    x: Math.round(0.9 * WORLD_WIDTH) + 60,
    y: Math.round(0.4 * WORLD_HEIGHT) + 50,
    zone: 'Aura Forge',
    dialogue: 'Strike the meter at its heart to forge perfect aura beats.',
    spriteColor: 0xff4466,
    roomPlacement: { room: 'Aura Forge', x: 480, y: 500 },
    kind: 'minigame',
    minigameId: 'forge-hammer',
  },
  {
    id: 'npc-nebula-kitchen-pan',
    name: 'Cosmic Skillet',
    x: Math.round(0.3 * WORLD_WIDTH) + 60,
    y: Math.round(0.7 * WORLD_HEIGHT) + 50,
    zone: 'Nebula Kitchen',
    dialogue: 'A pan steams in time with the recipe — feel the beat and cook!',
    spriteColor: 0xffaa44,
    roomPlacement: { room: 'Nebula Kitchen', x: 460, y: 500 },
    kind: 'minigame',
    minigameId: 'cooking-rhythm',
  },
  {
    id: 'npc-dream-hollow-catcher',
    name: 'Woven Dreamcatcher',
    x: Math.round(0.1 * WORLD_WIDTH) + 60,
    y: Math.round(0.8 * WORLD_HEIGHT) + 50,
    zone: 'Dream Hollow',
    dialogue: 'Catch wandering dreams — but let the nightmares slip through.',
    spriteColor: 0xcc66ff,
    roomPlacement: { room: 'Dream Hollow', x: 440, y: 520 },
    kind: 'minigame',
    minigameId: 'dream-catcher',
  },
  {
    id: 'npc-cosmic-library-tome',
    name: 'Lore Tome',
    x: Math.round(0.8 * WORLD_WIDTH) + 60,
    y: Math.round(0.6 * WORLD_HEIGHT) + 50,
    zone: 'Cosmic Library',
    dialogue: 'Riddles spill from the ancient pages — answer truly to glean STAR.',
    spriteColor: 0x8866ff,
    roomPlacement: { room: 'Cosmic Library', x: 480, y: 480 },
    kind: 'minigame',
    minigameId: 'lore-trivia',
  },
];

export function getRoomNPCDefinitions(room: RoomKey): NPCDefinition[] {
  return NPC_DEFINITIONS.filter((n) => n.roomPlacement?.room === room).map((n) => ({
    ...n,
    x: n.roomPlacement!.x,
    y: n.roomPlacement!.y,
  }));
}

// On the overworld map we only want the Spawn Fox visible — everyone else
// lives in their respective room. The quest board still opens via the
// 'quest-board-open' event (e.g. from the QuestTracker HUD).
export function getOverworldNPCDefinitions(): NPCDefinition[] {
  return NPC_DEFINITIONS.filter((n) => n.kind === 'intro');
}

export function npcSpriteTextureKey(id: string): string {
  return `npc-sprite-${id}`;
}
