import * as Phaser from 'phaser';
import { MinigameScene } from './MinigameScene';

interface FallingStar {
  sprite: Phaser.GameObjects.Container;
  vy: number;
  alive: boolean;
  pointValue: number;
  isBomb: boolean;
}

const PLAY_LEFT = 80;
const PLAY_RIGHT = 1120;
const PLAY_BOTTOM = 820;
const SPAWN_INTERVAL_MS = 700;

export class StarCatchScene extends MinigameScene {
  private stars: FallingStar[] = [];
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private playGfx: Phaser.GameObjects.Graphics | null = null;
  private isPaused = false;

  constructor() {
    super('StarCatchScene');
  }

  protected setup(): void {
    this.playGfx = this.add.graphics().setDepth(0);
    // Draw playfield border
    this.playGfx.lineStyle(2, 0x00f7ff, 0.4);
    this.playGfx.strokeRect(PLAY_LEFT - 4, 90, PLAY_RIGHT - PLAY_LEFT + 8, PLAY_BOTTOM - 90 + 8);
  }

  protected startPlay(): void {
    this.isPaused = false;
    this.spawnTimer = this.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this.spawnFallingObject(),
    });
  }

  protected setPlayPaused(paused: boolean): void {
    this.isPaused = paused;
    if (this.spawnTimer) this.spawnTimer.paused = paused;
  }

  protected teardownPlay(): void {
    this.isPaused = false;
    if (this.spawnTimer) {
      this.spawnTimer.destroy();
      this.spawnTimer = null;
    }
    for (const s of this.stars) {
      s.sprite.destroy();
    }
    this.stars = [];
  }

  protected updatePlaying(_time: number, delta: number): void {
    if (this.isPaused) return;
    const dt = delta / 1000;
    for (const s of this.stars) {
      if (!s.alive) continue;
      s.sprite.y += s.vy * dt;
      if (s.sprite.y > PLAY_BOTTOM) {
        s.alive = false;
        s.sprite.destroy();
        // Missing a regular star: small penalty (no negative), bomb missed: bonus
        if (s.isBomb) {
          this.addScore(2);
        }
      }
    }
    this.stars = this.stars.filter((s) => s.alive);
  }

  private spawnFallingObject() {
    if (this.isPaused) return;
    const x = Phaser.Math.Between(PLAY_LEFT + 20, PLAY_RIGHT - 20);
    const isBomb = Math.random() < 0.18;
    const speed = Phaser.Math.Between(180, 280);

    const container = this.add.container(x, 100).setDepth(5);
    const g = this.add.graphics();

    if (isBomb) {
      // Pixel-art bomb: dark circle + spark
      g.fillStyle(0x440011, 1);
      g.fillRect(-10, -10, 20, 20);
      g.fillStyle(0xff3344, 1);
      g.fillRect(-6, -6, 12, 12);
      g.fillStyle(0xffd700, 1);
      g.fillRect(-2, -12, 4, 4);
    } else {
      // Pixel-art star: cyan/gold
      g.fillStyle(0xffd700, 1);
      g.fillRect(-8, -2, 16, 4);
      g.fillRect(-2, -8, 4, 16);
      g.fillStyle(0x00f7ff, 1);
      g.fillRect(-4, -4, 8, 8);
    }
    container.add(g);
    container.setSize(24, 24);
    container.setInteractive({ useHandCursor: true });

    const star: FallingStar = {
      sprite: container,
      vy: speed,
      alive: true,
      pointValue: isBomb ? -8 : Phaser.Math.Between(3, 6),
      isBomb,
    };

    container.on('pointerdown', (event: Phaser.Input.Pointer) => {
      event.event?.stopPropagation?.();
      if (!star.alive || this.isPaused) return;
      star.alive = false;
      this.addScore(star.pointValue);
      this.flashAt(container.x, container.y, isBomb ? 0xff3344 : 0x00f7ff);
      container.destroy();
    });

    this.stars.push(star);
  }

  private flashAt(x: number, y: number, color: number) {
    const flash = this.add.graphics().setDepth(10);
    flash.fillStyle(color, 0.9);
    flash.fillCircle(x, y, 14);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 250,
      onComplete: () => flash.destroy(),
    });
  }
}
