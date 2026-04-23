import EventBus from '@/components/sanctuary/EventBus';

export interface ZoneDefinition {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  unlockLevel: number;
}

const ZONE_WIDTH = 120;
const ZONE_HEIGHT = 100;

const LOCATIONS: { name: string; nx: number; ny: number; unlockLevel: number }[] = [
  { name: 'Hot Springs', nx: 0.2, ny: 0.3, unlockLevel: 1 },
  { name: 'Training Grounds', nx: 0.7, ny: 0.2, unlockLevel: 1 },
  { name: 'Dream Hollow', nx: 0.1, ny: 0.8, unlockLevel: 1 },
  { name: 'Star Garden', nx: 0.5, ny: 0.5, unlockLevel: 2 },
  { name: 'Nebula Kitchen', nx: 0.3, ny: 0.7, unlockLevel: 2 },
  { name: 'Cosmic Library', nx: 0.8, ny: 0.6, unlockLevel: 3 },
  { name: 'Observatory', nx: 0.5, ny: 0.1, unlockLevel: 4 },
  { name: 'Aura Forge', nx: 0.9, ny: 0.4, unlockLevel: 5 },
];

function buildZones(worldWidth: number, worldHeight: number): ZoneDefinition[] {
  return LOCATIONS.map(({ name, nx, ny, unlockLevel }) => ({
    name,
    x: nx * worldWidth - ZONE_WIDTH / 2,
    y: ny * worldHeight - ZONE_HEIGHT / 2,
    width: ZONE_WIDTH,
    height: ZONE_HEIGHT,
    unlockLevel,
  }));
}

export class ZoneSystem {
  private zones: ZoneDefinition[];
  private currentZone: string | null = null;

  constructor(worldWidth: number, worldHeight: number) {
    this.zones = buildZones(worldWidth, worldHeight);
  }

  getZones(): readonly ZoneDefinition[] {
    return this.zones;
  }

  getCurrentZone(): string | null {
    return this.currentZone;
  }

  update(playerX: number, playerY: number): void {
    let insideZone: string | null = null;

    for (const zone of this.zones) {
      if (
        playerX >= zone.x &&
        playerX <= zone.x + zone.width &&
        playerY >= zone.y &&
        playerY <= zone.y + zone.height
      ) {
        insideZone = zone.name;
        break;
      }
    }

    if (insideZone !== this.currentZone) {
      if (this.currentZone) {
        EventBus.emit('location-exited', { name: this.currentZone });
      }
      if (insideZone) {
        EventBus.emit('location-entered', { name: insideZone });
      }
      this.currentZone = insideZone;
    }
  }

  destroy(): void {
    this.currentZone = null;
  }
}
