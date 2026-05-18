import * as Phaser from 'phaser';
import { MinigameScene } from './MinigameScene';

const METER_X = 600;
const METER_Y = 460;
const METER_WIDTH = 720;
const METER_HEIGHT = 60;
const MARKER_HEIGHT = 76;

const PERFECT_HALF_WIDTH = 28;
const GREAT_HALF_WIDTH = 80;
const GOOD_HALF_WIDTH = 150;

const BASE_SPEED = 520; // px / second
const SPEED_RAMP_PER_HIT = 14;
const MAX_SPEED = 1100;

const PERFECT_POINTS = 14;
const GREAT_POINTS = 8;
const GOOD_POINTS = 3;
const MISS_PENALTY = 4;

const ANVIL_DESCENT_MS = 220;

export class ForgeHammerScene extends MinigameScene {
  private markerX = 0;
  private direction = 1;
  private speed = BASE_SPEED;
  private isPaused = false;
  private inputCooldown = 0;
  private streak = 0;

  private meterGfx: Phaser.GameObjects.Graphics | null = null;
  private markerGfx: Phaser.GameObjects.Graphics | null = null;
  private hammer: Phaser.GameObjects.Container | null = null;
  private anvil: Phaser.GameObjects.Container | null = null;
  private feedbackText: Phaser.GameObjects.Text | null = null;
  private spaceKey: Phaser.Input.Keyboard.Key | null = null;
  private feedbackHideAt = 0;

  constructor() {
    super('ForgeHammerScene');
  }

  protected setup(): void {
    this.meterGfx = this.add.graphics().setDepth(1);
    this.markerGfx = this.add.graphics().setDepth(3);
    this.drawMeter();

    this.anvil = this.buildAnvil(METER_X, METER_Y + 180);
    this.hammer = this.buildHammer(METER_X, METER_Y + 60);

    this.feedbackText = this.add
      .text(METER_X, METER_Y - 110, '', {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '14px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(METER_X, METER_Y + 250, 'PRESS SPACE TO STRIKE', {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '10px',
        color: '#ff66aa',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  protected startPlay(): void {
    this.isPaused = false;
    this.markerX = METER_X - METER_WIDTH / 2;
    this.direction = 1;
    this.speed = BASE_SPEED;
    this.streak = 0;
    this.inputCooldown = 0;
    this.feedbackHideAt = 0;
    if (this.feedbackText) this.feedbackText.setText('');
    this.drawMarker();
  }

  protected setPlayPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  protected teardownPlay(): void {
    this.isPaused = false;
    this.streak = 0;
    if (this.feedbackText) this.feedbackText.setText('');
    if (this.hammer) this.hammer.setRotation(0);
  }

  protected updatePlaying(time: number, delta: number): void {
    if (this.isPaused) return;
    const dt = delta / 1000;
    this.markerX += this.direction * this.speed * dt;
    const left = METER_X - METER_WIDTH / 2;
    const right = METER_X + METER_WIDTH / 2;
    if (this.markerX <= left) {
      this.markerX = left;
      this.direction = 1;
    } else if (this.markerX >= right) {
      this.markerX = right;
      this.direction = -1;
    }
    this.drawMarker();

    if (this.inputCooldown > 0) {
      this.inputCooldown -= delta;
    } else if (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.handleStrike();
    }

    if (this.feedbackHideAt > 0 && time > this.feedbackHideAt && this.feedbackText) {
      this.feedbackText.setAlpha(Math.max(0, this.feedbackText.alpha - delta / 250));
    }
  }

  private handleStrike() {
    const offset = Math.abs(this.markerX - METER_X);
    let label: string;
    let color: string;
    let points: number;
    if (offset <= PERFECT_HALF_WIDTH) {
      label = 'PERFECT';
      color = '#ffd700';
      points = PERFECT_POINTS;
      this.streak += 1;
    } else if (offset <= GREAT_HALF_WIDTH) {
      label = 'GREAT';
      color = '#00f7ff';
      points = GREAT_POINTS;
      this.streak += 1;
    } else if (offset <= GOOD_HALF_WIDTH) {
      label = 'GOOD';
      color = '#9966ff';
      points = GOOD_POINTS;
      this.streak += 1;
    } else {
      label = 'MISS';
      color = '#ff3344';
      points = -MISS_PENALTY;
      this.streak = 0;
    }

    const streakBonus = Math.min(this.streak, 5);
    if (points > 0 && streakBonus > 1) points += streakBonus - 1;
    this.addScore(points);

    if (points > 0) {
      this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP_PER_HIT);
    } else {
      this.speed = Math.max(BASE_SPEED, this.speed - SPEED_RAMP_PER_HIT * 4);
    }

    this.showFeedback(label, color);
    this.swingHammer(points > 0);
    this.inputCooldown = ANVIL_DESCENT_MS;
  }

  private showFeedback(label: string, color: string) {
    const ft = this.feedbackText;
    if (!ft) return;
    const streakTag = this.streak > 1 ? `  x${this.streak}` : '';
    ft.setText(`${label}${streakTag}`);
    ft.setColor(color);
    ft.setAlpha(1);
    this.feedbackHideAt = this.time.now + 600;
  }

  private drawMeter() {
    const g = this.meterGfx;
    if (!g) return;
    g.clear();
    const left = METER_X - METER_WIDTH / 2;
    const top = METER_Y - METER_HEIGHT / 2;
    g.fillStyle(0x110022, 1);
    g.fillRect(left, top, METER_WIDTH, METER_HEIGHT);

    g.fillStyle(0x66ff88, 0.55);
    g.fillRect(METER_X - GOOD_HALF_WIDTH, top, GOOD_HALF_WIDTH * 2, METER_HEIGHT);
    g.fillStyle(0x00f7ff, 0.7);
    g.fillRect(METER_X - GREAT_HALF_WIDTH, top, GREAT_HALF_WIDTH * 2, METER_HEIGHT);
    g.fillStyle(0xffd700, 0.9);
    g.fillRect(METER_X - PERFECT_HALF_WIDTH, top, PERFECT_HALF_WIDTH * 2, METER_HEIGHT);

    g.lineStyle(2, 0xff66aa, 0.9);
    g.strokeRect(left, top, METER_WIDTH, METER_HEIGHT);
    g.lineStyle(1, 0xffffff, 0.7);
    g.lineBetween(METER_X, top - 6, METER_X, top + METER_HEIGHT + 6);
  }

  private drawMarker() {
    const g = this.markerGfx;
    if (!g) return;
    g.clear();
    const top = METER_Y - MARKER_HEIGHT / 2;
    g.fillStyle(0xffffff, 1);
    g.fillRect(this.markerX - 3, top, 6, MARKER_HEIGHT);
    g.fillStyle(0xffd700, 1);
    g.fillRect(this.markerX - 6, top - 4, 12, 6);
    g.fillRect(this.markerX - 6, top + MARKER_HEIGHT - 2, 12, 6);
  }

  private buildAnvil(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(2);
    const g = this.add.graphics();
    g.fillStyle(0x303040, 1);
    g.fillRect(-90, -16, 180, 32);
    g.fillRect(-60, -28, 120, 12);
    g.fillStyle(0x505064, 1);
    g.fillRect(-86, -12, 172, 8);
    g.fillStyle(0xff66aa, 0.9);
    g.fillRect(-50, -28, 100, 4);
    c.add(g);
    return c;
  }

  private buildHammer(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(4);
    const g = this.add.graphics();
    // Handle
    g.fillStyle(0x885522, 1);
    g.fillRect(-4, -10, 8, 80);
    // Head
    g.fillStyle(0x778899, 1);
    g.fillRect(-30, -28, 60, 22);
    g.fillStyle(0xaabbcc, 1);
    g.fillRect(-26, -24, 52, 6);
    g.fillStyle(0xffd700, 1);
    g.fillRect(-30, -10, 60, 4);
    c.add(g);
    return c;
  }

  private swingHammer(success: boolean) {
    const h = this.hammer;
    if (!h) return;
    this.tweens.killTweensOf(h);
    this.tweens.add({
      targets: h,
      angle: success ? 14 : -10,
      duration: ANVIL_DESCENT_MS / 2,
      yoyo: true,
      ease: 'Cubic.easeOut',
    });
  }
}
