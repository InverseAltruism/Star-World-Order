import { describe, it, expect } from 'vitest';
import {
  BUILDING_IDS,
  BUILDING_DISPLAY_NAMES,
  type BuildingId,
} from '../config/npcDefinitionsV3';

const AUDIO_AMBIENT_KEYS = [
  'Hot Springs',
  'Training Grounds',
  'Dream Hollow',
  'Star Garden',
  'Nebula Kitchen',
  'Cosmic Library',
  'Observatory',
  'Aura Forge',
];

describe('BUILDING_DISPLAY_NAMES', () => {
  it('covers every BuildingId', () => {
    for (const id of BUILDING_IDS) {
      expect(BUILDING_DISPLAY_NAMES[id]).toBeTruthy();
    }
  });

  it('display names match shared audio AMBIENT_TRACKS keys', () => {
    const displayNames = (BUILDING_IDS as readonly BuildingId[]).map(
      id => BUILDING_DISPLAY_NAMES[id],
    );
    for (const expected of AUDIO_AMBIENT_KEYS) {
      expect(displayNames).toContain(expected);
    }
  });

  it('display names match V2 DOORS room values for parity', async () => {
    const { DOORS } = await import('../../config/worldLayout');
    const v2Rooms = new Set(DOORS.map(d => d.room as string));
    const v3Names = new Set(
      (BUILDING_IDS as readonly BuildingId[]).map(id => BUILDING_DISPLAY_NAMES[id]),
    );
    for (const name of v3Names) {
      expect(v2Rooms.has(name)).toBe(true);
    }
  });
});
