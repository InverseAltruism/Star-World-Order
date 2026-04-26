import Phaser from 'phaser';
import { MinigameScene } from './MinigameScene';

type OrbKind = 'dream' | 'lucid' | 'nightmare';

interface FallingOrb {
  container: Phaser.GameObjects.Container;
  vy: number;
  vx: number;
  kind: OrbKind;
  alive: boolean;
}

const PLAY_LEFT = 80;
const PLAY_RIGHT = 1120;
const PLAY_TOP = 110;
const FLOOR_Y = 800;
const CATCHER_Y = 760;
const CATCHER_HALF_W = 80;
const CATCHER_SPEED = 720; // px/sec
const SPAWN_INTERVAL_MS = 580;

const KIND_COLOR: Record<OrbKind, number> = {
  dream: 0x66ff88,
  lucid: 0xffd700,
  nightmare: 0xff3344,
};

const KIND_POINTS: Record<OrbKind, number> = {
  dream: 6,
  lucid: 12,
  nightmare: -10,
};

export class DreamCatcherScene extends MinigameScene {
  private orbs: FallingOrb[] = [];
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private isPaused = false;
  private catcherX = 600;
  private catcher: Phaser.GameObjects.Container | null = null;
  private leftKey: Phaser.Input.Keyboard.Key | null = null;
  private rightKey: Phaser.Input.Keyboard.Key | null = null;
  private aKey: Phaser.Input.Keyboard.Key | null = null;
  private dKey: Phaser.Input.Keyboard.Key | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private nightmareStreak = 0;

  constructor() {
    super('DreamCatcherScene');
  }

  protected setup(): void {
    const border = this.add.graphics().setDepth(0);
    border.lineStyle(2, 0xcc66ff, 0.4);
    border.strokeRect(PLAY_LEFT - 4, PLAY_TOP - 4, PLAY_RIGHT - PLAY_LEFT + 8, FLOOR_Y - PLAY_TOP + 8);

    // Misty floor
    const floor = this.add.graphics().setDepth(0);
    floor.fillStyle(0x1a0033, 0.65);
    floor.fillRect(PLAY_LEFT, FLOOR_Y - 20, PLAY_RIGHT - PLAY_LEFT, 24);

    this.add
      .text(600, 90, 'CATCH DREAMS · AVOID NIGHTMARES', {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '12px',
        color: '#cc66ff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.statusText = this.add
      .text(600, 840, 'ARROW KEYS / A · D TO MOVE', {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '10px',
        color: '#9966ff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.catcher = this.buildCatcher(this.catcherX, CATCHER_Y);

    const kb = this.input.keyboard!;
    this.leftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.aKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }

  protected startPlay(): void {
    this.isPaused = false;
    this.catcherX = 600;
    this.nightmareStreak = 0;
    if (this.catcher) this.catcher.x = this.catcherX;
    this.spawnTimer = this.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this.spawnOrb(),
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
    for (const o of this.orbs) o.container.destroy();
    this.orbs = [];
  }

  protected updatePlaying(_time: number, delta: number): void {
    if (this.isPaused) return;
    const dt = delta / 1000;

    let dx = 0;
    if ((this.leftKey && this.leftKey.isDown) || (this.aKey && this.aKey.isDown)) dx -= 1;
    if ((this.rightKey && this.rightKey.isDown) || (this.dKey && this.dKey.isDown)) dx += 1;
    if (dx !== 0) {
      this.catcherX = Phaser.Math.Clamp(
        this.catcherX + dx * CATCHER_SPEED * dt,
        PLAY_LEFT + CATCHER_HALF_W,
        PLAY_RIGHT - CATCHER_HALF_W,
      );
      if (this.catcher) this.catcher.x = this.catcherX;
    }

    for (const orb of this.orbs) {
      if (!orb.alive) continue;
      orb.container.y += orb.vy * dt;
      orb.container.x += orb.vx * dt;
      // Bounce off side walls (gentle drift only)
      if (orb.container.x < PLAY_LEFT + 14 || orb.container.x > PLAY_RIGHT - 14) {
        orb.vx = -orb.vx;
      }
      // Catch detection
      if (orb.container.y >= CATCHER_Y - 22 && orb.container.y <= CATCHER_Y + 18) {
        if (Math.abs(orb.container.x - this.catcherX) <= CATCHER_HALF_W) {
          this.handleCaught(orb);
          continue;
        }
      }
      if (orb.container.y > FLOOR_Y) {
        orb.alive = false;
        orb.container.destroy();
        // Nightmares hitting the floor: reward (you avoided it)
        if (orb.kind === 'nightmare') {
          this.addScore(2);
          this.nightmareStreak = 0;
        } else {
          // Lost a dream — small penalty for letting it fade
          this.addScore(-2);
        }
      }
    }
    this.orbs = this.orbs.filter((o) => o.alive);
  }

  private handleCaught(orb: FallingOrb) {
    orb.alive = false;
    const points = KIND_POINTS[orb.kind];
    this.addScore(points);
    if (orb.kind === 'nightmare') {
      this.nightmareStreak += 1;
      if (this.nightmareStreak >= 2) {
        this.addScore(-3); // extra penalty for repeated mistakes
      }
    } else {
      this.nightmareStreak = 0;
    }
    this.flashAt(orb.container.x, orb.container.y, KIND_COLOR[orb.kind]);
    orb.container.destroy();
  }

  private spawnOrb() {
    if (this.isPaused) return;
    const roll = Math.random();
    let kind: OrbKind;
    if (roll < 0.18) kind = 'nightmare';
    else if (roll < 0.32) kind = 'lucid';
    else kind = 'dream';

    const x = Phaser.Math.Between(PLAY_LEFT + 30, PLAY_RIGHT - 30);
    const container = this.add.container(x, PLAY_TOP + 20).setDepth(5);
    container.add(this.drawOrb(kind));
    const orb: FallingOrb = {
      container,
      vy: Phaser.Math.Between(170, 260),
      vx: Phaser.Math.Between(-40, 40),
      kind,
      alive: true,
    };
    this.orbs.push(orb);
  }

  private drawOrb(kind: OrbKind): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const color = KIND_COLOR[kind];
    if (kind === 'nightmare') {
      // Spiky pixel-art nightmare
      g.fillStyle(0x110011, 1);
      g.fillRect(-12, -12, 24, 24);
      g.fillStyle(color, 1);
      g.fillTriangle(-14, 0, 0, -18, 14, 0);
      g.fillTriangle(-14, 0, 0, 18, 14, 0);
      g.fillStyle(0xffd700, 1);
      g.fillRect(-3, -3, 6, 6);
    } else if (kind === 'lucid') {
      // Lucid: bright glowing pixel star
      g.fillStyle(color, 0.4);
      g.fillCircle(0, 0, 18);
      g.fillStyle(color, 1);
      g.fillRect(-3, -14, 6, 28);
      g.fillRect(-14, -3, 28, 6);
      g.fillStyle(0xffffff, 1);
      g.fillRect(-2, -2, 4, 4);
    } else {
      // Dream: soft pixel orb
      g.fillStyle(color, 0.4);
      g.fillCircle(0, 0, 14);
      g.fillStyle(color, 1);
      g.fillCircle(0, 0, 9);
      g.fillStyle(0xffffff, 1);
      g.fillRect(-2, -2, 4, 4);
    }
    return g;
  }

  private buildCatcher(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(8);
    const g = this.add.graphics();
    // Hoop
    g.lineStyle(4, 0x885522, 1);
    g.strokeCircle(0, 0, CATCHER_HALF_W - 4);
    g.lineStyle(2, 0xcc66ff, 0.85);
    g.strokeCircle(0, 0, CATCHER_HALF_W - 12);
    // Web pattern
    g.lineStyle(1, 0xffffff, 0.55);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      g.lineBetween(0, 0, Math.cos(ang) * (CATCHER_HALF_W - 6), Math.sin(ang) * (CATCHER_HALF_W - 6));
    }
    // Feathers
    g.fillStyle(0xffd700, 0.85);
    g.fillTriangle(-20, CATCHER_HALF_W - 6, -10, CATCHER_HALF_W + 18, 0, CATCHER_HALF_W - 6);
    g.fillStyle(0xff66aa, 0.85);
    g.fillTriangle(20, CATCHER_HALF_W - 6, 10, CATCHER_HALF_W + 18, 0, CATCHER_HALF_W - 6);
    c.add(g);
    return c;
  }

  private flashAt(x: number, y: number, color: number) {
    const flash = this.add.graphics().setDepth(15);
    flash.fillStyle(color, 0.85);
    flash.fillCircle(x, y, 18);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.6,
      duration: 280,
      onComplete: () => flash.destroy(),
    });
  }
}
