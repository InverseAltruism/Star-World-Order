import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    EventBus.emit('boot-progress', { phase: 'loading' });

    this.load.tilemapTiledJSON('world-map', '/sanctuary/world-map.json');
    this.load.image('tileset', '/sanctuary/tileset.png');
    this.load.image('player', '/sanctuary/player.png');
  }

  create() {
    EventBus.emit('boot-progress', { phase: 'ready' });
    this.scene.start('WorldScene');
  }
}
