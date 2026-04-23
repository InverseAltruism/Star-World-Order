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

const GAME_WIDTH = 1024;
const GAME_HEIGHT = 576;

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

function buildZones(): ZoneDefinition[] {
  return LOCATIONS.map(({ name, nx, ny, unlockLevel }) => ({
    name,
    x: nx * GAME_WIDTH - ZONE_WIDTH / 2,
    y: ny * GAME_HEIGHT - ZONE_HEIGHT / 2,
    width: ZONE_WIDTH,
    height: ZONE_HEIGHT,
    unlockLevel,
  }));
}

export class ZoneSystem {
  private zones: ZoneDefinition[];
  private currentZone: string | null = null;

  constructor() {
    this.zones = buildZones();
  }

  getZones(): readonly ZoneDefinition[] {
    return this.zones;
  }

  getCurrentZone(): string | null {
    return this.currentZone;
  }

  update(playerX: number, playerY: number): void {
    const entered = this.zones.find(
      (z) =>
        playerX >= z.x &&
        playerX <= z.x + z.width &&
        playerY >= z.y &&
        playerY <= z.y + z.height
    );

    const newZone = entered?.name ?? null;

    if (newZone === this.currentZone) return;

    if (this.currentZone !== null) {
      EventBus.emit('location-exited', { name: this.currentZone });
    }

    this.currentZone = newZone;

    if (newZone !== null) {
      EventBus.emit('location-entered', {
        name: newZone,
        unlockLevel: entered!.unlockLevel,
      });
    }
  }

  destroy(): void {
    this.currentZone = null;
  }
}
