import { ROOMS, type Rect, type RoomKey } from './worldLayout';

export interface RoomLayout {
  collision: Rect[];
}

// Per-room collision data is extracted by painting red masks on copies of the
// room PNGs under public/sanctuary/ and running a room-layout variant of
// scripts/extract_sanctuary_layout.mjs. Until that art pass is authored, each
// room ships with an empty collision array so players can move freely inside.
// Populate the maps below as each room is marked up.
const EMPTY: Rect[] = [];

export const ROOM_LAYOUTS: Record<RoomKey, RoomLayout> = ROOMS.reduce(
  (acc, room) => {
    acc[room] = { collision: EMPTY };
    return acc;
  },
  {} as Record<RoomKey, RoomLayout>,
);

export function getRoomLayout(room: RoomKey): RoomLayout {
  return ROOM_LAYOUTS[room] ?? { collision: EMPTY };
}
