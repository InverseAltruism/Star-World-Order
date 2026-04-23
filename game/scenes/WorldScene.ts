import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { ZoneSystem } from '@/game/systems/ZoneSystem';

export class WorldScene extends Phaser.Scene {
  private zoneSystem!: ZoneSystem;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    this.zoneSystem = new ZoneSystem();

    const { width, height } = this.scale;

    const title = this.add.text(width / 2, height / 2 - 40, 'SANCTUARY V2', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '24px',
      color: '#00f7ff',
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height / 2 + 10, 'Phaser canvas active', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#9966ff',
    });
    subtitle.setOrigin(0.5);

    this.drawZoneOverlays();

    EventBus.on('player-moved', this.onPlayerMoved, this);

    EventBus.emit('scene-ready', this);
  }

  private onPlayerMoved(pos: { x: number; y: number }): void {
    this.zoneSystem.update(pos.x, pos.y);
  }

  private drawZoneOverlays(): void {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x9966ff, 0.25);

    for (const zone of this.zoneSystem.getZones()) {
      gfx.strokeRect(zone.x, zone.y, zone.width, zone.height);
    }
  }

  update() {
    // Zone checks are driven by player-moved events, not polling
  }

  shutdown() {
    EventBus.off('player-moved', this.onPlayerMoved, this);
    this.zoneSystem.destroy();
  }
}
