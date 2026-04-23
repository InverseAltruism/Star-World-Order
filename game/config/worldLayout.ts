export const WORLD_WIDTH = 1448;
export const WORLD_HEIGHT = 1086;
export const NAV_CELL = 16;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Door extends Rect {
  room: RoomKey;
}

export const ROOMS = [
  'Hot Springs',
  'Observatory',
  'Training Grounds',
  'Nebula Kitchen',
  'Star Garden',
  'Cosmic Library',
  'Dream Hollow',
  'Aura Forge',
] as const;

export type RoomKey = (typeof ROOMS)[number];

export const SPAWN = { x: 724, y: 700 };

export const DOORS: Door[] = [];

export const COLLISION: Rect[] = [
  { x: 0, y: 0, w: WORLD_WIDTH, h: 24 },
  { x: 0, y: WORLD_HEIGHT - 24, w: WORLD_WIDTH, h: 24 },
  { x: 0, y: 0, w: 24, h: WORLD_HEIGHT },
  { x: WORLD_WIDTH - 24, y: 0, w: 24, h: WORLD_HEIGHT },
];
