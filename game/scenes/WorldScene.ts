import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';

export class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
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

    EventBus.emit('scene-ready', this);
  }
}
