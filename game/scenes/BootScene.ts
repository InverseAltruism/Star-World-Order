import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSprite } from '../sprites/PlayerSprite';
import { CompanionSprite } from '../sprites/CompanionSprite';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    EventBus.emit('boot-progress', { phase: 'loading' });

    this.load.image('map_bg', '/sanctuary/map_bg.png');
    CompanionSprite.loadAssets(this);
  }

  create() {
    PlayerSprite.generateTextures(this);
    CompanionSprite.generateFallbackTexture(this);

    EventBus.emit('boot-progress', { phase: 'ready' });
    this.scene.start('WorldScene');
  }
}
