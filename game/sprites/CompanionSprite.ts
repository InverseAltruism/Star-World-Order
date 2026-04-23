import Phaser from 'phaser';
import type { Direction } from './PlayerSprite';

const LERP_FACTOR = 0.15;
const FOLLOW_DISTANCE = 20;

export class CompanionSprite extends Phaser.GameObjects.Sprite {
  private followOffsetX = FOLLOW_DISTANCE;
  private followOffsetY = FOLLOW_DISTANCE / 2;
  private bobPhase = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey?: string) {
    super(scene, x, y, textureKey || 'companion-placeholder');
    scene.add.existing(this);
    this.setDepth(9);
  }

  static generatePlaceholderTexture(scene: Phaser.Scene) {
    if (scene.textures.exists('companion-placeholder')) return;

    const g = scene.make.graphics();

    // Magenta blob body
    g.fillStyle(0xff00ff, 1);
    g.fillCircle(8, 8, 5);

    // Inner highlight
    g.fillStyle(0xff66ff, 1);
    g.fillCircle(7, 6, 2);

    // Eyes
    g.fillStyle(0xffffff, 1);
    g.fillRect(6, 6, 2, 2);
    g.fillRect(10, 6, 2, 2);

    // Pupils
    g.fillStyle(0x000000, 1);
    g.fillRect(7, 7, 1, 1);
    g.fillRect(11, 7, 1, 1);

    g.generateTexture('companion-placeholder', 16, 16);
    g.destroy();
  }

  followPlayer(playerX: number, playerY: number, playerDirection?: Direction) {
    let targetOffsetX = FOLLOW_DISTANCE;
    let targetOffsetY = FOLLOW_DISTANCE / 2;

    switch (playerDirection) {
      case 'left':
        targetOffsetX = FOLLOW_DISTANCE;
        targetOffsetY = 0;
        break;
      case 'right':
        targetOffsetX = -FOLLOW_DISTANCE;
        targetOffsetY = 0;
        break;
      case 'up':
        targetOffsetX = FOLLOW_DISTANCE / 2;
        targetOffsetY = FOLLOW_DISTANCE;
        break;
      case 'down':
        targetOffsetX = FOLLOW_DISTANCE / 2;
        targetOffsetY = -FOLLOW_DISTANCE;
        break;
    }

    // Smoothly transition the offset
    this.followOffsetX += (targetOffsetX - this.followOffsetX) * 0.05;
    this.followOffsetY += (targetOffsetY - this.followOffsetY) * 0.05;

    const targetX = playerX + this.followOffsetX;
    const targetY = playerY + this.followOffsetY;

    this.x += (targetX - this.x) * LERP_FACTOR;
    this.y += (targetY - this.y) * LERP_FACTOR;

    // Gentle floating bob
    this.bobPhase += 0.05;
    this.y += Math.sin(this.bobPhase) * 0.3;
  }

  setNFTTexture(url: string) {
    const key = 'companion-nft';
    if (this.scene.textures.exists(key)) {
      this.setTexture(key);
      return;
    }

    this.scene.load.image(key, url);
    this.scene.load.once('complete', () => {
      if (this.scene.textures.exists(key)) {
        this.setTexture(key);
      }
    });
    this.scene.load.start();
  }
}
