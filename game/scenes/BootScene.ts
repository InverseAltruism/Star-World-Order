import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSprite } from '../sprites/PlayerSprite';
import { CompanionSprite } from '../sprites/CompanionSprite';
import { NPCSprite } from '../sprites/NPCSprite';
import { AnimationSystem } from '../systems/AnimationSystem';
import { NPC_DEFINITIONS, npcSpriteTextureKey } from '../config/npcDefinitions';
import { ROOMS } from '../config/worldLayout';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    EventBus.emit('boot-progress', { phase: 'loading' });

    this.load.image('world-bg', '/sanctuary/Sanctuary_map.png');
    this.load.image('player-sheet', '/sanctuary/Male_Grey_Sprite_transparent.png');

    for (const room of ROOMS) {
      this.load.image(`room-bg-${room}`, `/sanctuary/${encodeURI(room)}.png`);
    }

    for (const def of NPC_DEFINITIONS) {
      if (def.spriteFile) {
        this.load.image(npcSpriteTextureKey(def.id), `/sanctuary/${encodeURI(def.spriteFile)}`);
      }
    }

    AnimationSystem.preloadConstellations(this, ['aether', 'spectra']);
  }

  create() {
    PlayerSprite.registerFrames(this);
    PlayerSprite.generatePlaceholderTextures(this);
    CompanionSprite.generatePlaceholderTexture(this);

    for (const def of NPC_DEFINITIONS) {
      NPCSprite.generatePlaceholderTexture(this, def.id, def.spriteColor);
    }

    this.generateRoomPlaceholder();

    EventBus.emit('boot-progress', { phase: 'ready' });
    this.scene.start('WorldScene');
  }

  private generateRoomPlaceholder() {
    const g = this.add.graphics();
    const w = 480;
    const h = 320;
    g.fillStyle(0x1a0033, 1);
    g.fillRect(0, 0, w, h);
    g.lineStyle(2, 0x00f7ff, 1);
    g.strokeRect(8, 8, w - 16, h - 16);
    g.lineStyle(1, 0x9966ff, 0.4);
    for (let x = 16; x < w - 16; x += 16) g.lineBetween(x, 8, x, h - 8);
    for (let y = 16; y < h - 16; y += 16) g.lineBetween(8, y, w - 8, y);
    g.generateTexture('room-placeholder', w, h);
    g.destroy();
  }
}
