import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    EventBus.emit('boot-progress', { phase: 'loading' });
  }

  create() {
    EventBus.emit('boot-progress', { phase: 'ready' });
    this.scene.start('WorldScene');
  }
}
