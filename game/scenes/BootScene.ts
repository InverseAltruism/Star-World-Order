import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSprite } from '../sprites/PlayerSprite';
import { CompanionSprite } from '../sprites/CompanionSprite';
import { AnimationSystem } from '../systems/AnimationSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    EventBus.emit('boot-progress', { phase: 'loading' });

    this.load.tilemapTiledJSON('world-map', '/sanctuary/world-map.json');
    this.load.image('tileset', '/sanctuary/tileset.png');

    AnimationSystem.preloadConstellations(this, ['aether', 'spectra']);
  }

  create() {
    PlayerSprite.generatePlaceholderTextures(this);
    CompanionSprite.generatePlaceholderTexture(this);

    EventBus.emit('boot-progress', { phase: 'ready' });
    this.scene.start('WorldScene');
  }
}
