import type { RoomKey } from './worldLayout';

export interface QuestSource {
  npcId: string;
  npcName: string;
  zone: string;
  room: RoomKey | null;
}

const SPAWN_FOX: QuestSource = {
  npcId: 'spawn-fox',
  npcName: 'Spawn Fox',
  zone: 'Town Square',
  room: null,
};

const QUEST_SOURCE_BY_REQUIREMENT: Record<string, QuestSource> = {
  observatory: {
    npcId: 'npc-observatory',
    npcName: 'Astris',
    zone: 'Observatory',
    room: 'Observatory',
  },
  springs: {
    npcId: 'npc-hot-springs',
    npcName: 'Ember',
    zone: 'Hot Springs',
    room: 'Hot Springs',
  },
  training: {
    npcId: 'npc-training-grounds',
    npcName: 'Valor',
    zone: 'Training Grounds',
    room: 'Training Grounds',
  },
  dream: {
    npcId: 'npc-dream-hollow',
    npcName: 'Somnia',
    zone: 'Dream Hollow',
    room: 'Dream Hollow',
  },
  garden: {
    npcId: 'npc-star-garden',
    npcName: 'Flora',
    zone: 'Star Garden',
    room: 'Star Garden',
  },
  kitchen: {
    npcId: 'npc-nebula-kitchen',
    npcName: 'Chef Cosmo',
    zone: 'Nebula Kitchen',
    room: 'Nebula Kitchen',
  },
  library: {
    npcId: 'npc-cosmic-library',
    npcName: 'Lorekeeper',
    zone: 'Cosmic Library',
    room: 'Cosmic Library',
  },
  forge: {
    npcId: 'npc-aura-forge',
    npcName: 'Pyrix',
    zone: 'Aura Forge',
    room: 'Aura Forge',
  },
  interact: SPAWN_FOX,
  feed: SPAWN_FOX,
  chat: SPAWN_FOX,
  explore: SPAWN_FOX,
  bond_threshold: SPAWN_FOX,
  daily_streak: SPAWN_FOX,
};

export function getQuestSource(requirementType: string): QuestSource {
  return QUEST_SOURCE_BY_REQUIREMENT[requirementType] ?? SPAWN_FOX;
}
