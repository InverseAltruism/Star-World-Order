import Phaser from 'phaser';
import type { Direction } from './PlayerSprite';
import { AnimationSystem, type CompanionMood, type Constellation, CONSTELLATIONS } from '../systems/AnimationSystem';

const LERP_FACTOR = 0.15;
const FOLLOW_DISTANCE = 20;
const MOVEMENT_THRESHOLD = 0.1;

export type { Constellation };
export { CONSTELLATIONS };

export class CompanionSprite extends Phaser.GameObjects.Sprite {
  private followOffsetX = FOLLOW_DISTANCE;
  private followOffsetY = FOLLOW_DISTANCE / 2;
  private baseY = 0;
  private animSystem: AnimationSystem | null = null;
  private lastTime = 0;
  private prevTextureKey = '';
  private away = false;
  private zzzText: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey?: string) {
    super(scene, x, y, textureKey || 'companion-placeholder');
    scene.add.existing(this);
    this.setDepth(9);
    this.setScale(1.5);
    this.baseY = y;
  }

  isAway(): boolean {
    return this.away;
  }

  setAway(away: boolean) {
    if (this.away === away) return;
    this.away = away;

    if (away) {
      this.setAlpha(0.45);
      this.setTint(0x8899cc);
      if (this.animSystem) {
        this.animSystem.setMood('sleepy');
        this.refreshTexture();
      }
      if (!this.zzzText && this.scene) {
        this.zzzText = this.scene.add
          .text(this.x, this.y - 12, 'Zzz', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '6px',
            color: '#9966ff',
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5, 1)
          .setDepth(10);
      }
    } else {
      this.setAlpha(1);
      this.clearTint();
      if (this.zzzText) {
        this.zzzText.destroy();
        this.zzzText = null;
      }
    }
  }

  static loadConstellationAssets(scene: Phaser.Scene): void {
    for (const c of CONSTELLATIONS) {
      scene.load.image(`companion-${c}`, `/sanctuary/companions/${c}/idle.png`);
    }
  }

  static generatePlaceholderTexture(scene: Phaser.Scene) {
    if (scene.textures.exists('companion-placeholder')) return;

    const g = scene.make.graphics();

    g.fillStyle(0xff00ff, 1);
    g.fillCircle(8, 8, 5);

    g.fillStyle(0xff66ff, 1);
    g.fillCircle(7, 6, 2);

    g.fillStyle(0xffffff, 1);
    g.fillRect(6, 6, 2, 2);
    g.fillRect(10, 6, 2, 2);

    g.fillStyle(0x000000, 1);
    g.fillRect(7, 7, 1, 1);
    g.fillRect(11, 7, 1, 1);

    g.generateTexture('companion-placeholder', 16, 16);
    g.destroy();
  }

  setAnimationSystem(system: AnimationSystem) {
    this.animSystem = system;
  }

  setMood(mood: CompanionMood) {
    if (!this.animSystem) return;
    if (this.animSystem.setMood(mood)) {
      this.refreshTexture();
    }
  }

  async setConstellation(constellation: Constellation) {
    if (!this.animSystem) {
      const key = `companion-${constellation}`;
      if (this.scene.textures.exists(key)) {
        this.setTexture(key);
      }
      return;
    }

    this.animSystem.setConstellation(constellation);

    if (!this.animSystem.isLoaded(constellation)) {
      this.animSystem.loadConstellationTextures(constellation);
      await this.animSystem.startLoad();
    }

    this.refreshTexture();
  }

  private refreshTexture() {
    if (!this.animSystem) return;

    const animKey = this.animSystem.getAnimationKey();
    if (animKey && this.scene.anims.exists(animKey)) {
      this.play(animKey, true);
      this.prevTextureKey = '';
      return;
    }

    const textureKey = this.animSystem.getTextureKey();
    if (textureKey !== this.prevTextureKey) {
      this.prevTextureKey = textureKey;
      this.setTexture(textureKey);
    }
  }

  followPlayer(playerX: number, playerY: number, playerDirection?: Direction) {
    const now = this.scene.time.now;
    const delta = this.lastTime ? Math.min(now - this.lastTime, 50) : 16;
    this.lastTime = now;

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

    this.followOffsetX += (targetOffsetX - this.followOffsetX) * 0.05;
    this.followOffsetY += (targetOffsetY - this.followOffsetY) * 0.05;

    const targetX = playerX + this.followOffsetX;
    const targetY = playerY + this.followOffsetY;

    const prevX = this.x;
    const prevBaseY = this.baseY;

    this.x += (targetX - this.x) * LERP_FACTOR;
    this.baseY += (targetY - this.baseY) * LERP_FACTOR;

    const dx = this.x - prevX;
    const dy = this.baseY - prevBaseY;
    const isMoving = Math.abs(dx) > MOVEMENT_THRESHOLD || Math.abs(dy) > MOVEMENT_THRESHOLD;

    if (this.animSystem) {
      const stateChanged = this.animSystem.setState(isMoving ? 'walk' : 'idle');

      if (isMoving && playerDirection) {
        this.animSystem.setWalkDirection(playerDirection);
      }

      const yOffset = this.animSystem.getYOffset(delta);
      this.y = this.baseY + yOffset;

      if (stateChanged) {
        this.refreshTexture();
      }
    } else {
      this.y = this.baseY + Math.sin(now * 0.003) * 0.3;
    }

    if (playerDirection === 'left') {
      this.setFlipX(true);
    } else if (playerDirection === 'right') {
      this.setFlipX(false);
    }

    if (this.zzzText) {
      const bob = Math.sin(now * 0.004) * 1.5;
      this.zzzText.setPosition(this.x, this.y - 14 + bob);
    }
  }

  destroy(fromScene?: boolean): void {
    if (this.zzzText) {
      this.zzzText.destroy();
      this.zzzText = null;
    }
    super.destroy(fromScene);
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
