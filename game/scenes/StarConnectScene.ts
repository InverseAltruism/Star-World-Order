import Phaser from 'phaser';
import { MinigameScene } from './MinigameScene';

interface StarNode {
  index: number;
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  active: boolean;
  litUntil: number;
}

const PLAY_LEFT = 120;
const PLAY_RIGHT = 1080;
const PLAY_TOP = 130;
const PLAY_BOTTOM = 800;
const STAR_COUNT_MIN = 5;
const STAR_COUNT_MAX = 7;
const POINTS_PER_STAR = 3;
const POINTS_PER_CONSTELLATION = 18;
const PERFECT_BONUS = 8;
const MIN_STAR_SPACING = 120;

export class StarConnectScene extends MinigameScene {
  private stars: StarNode[] = [];
  private targetSequence: number[] = [];
  private nextTargetIdx = 0;
  private constellationIndex = 0;
  private mistakesThisRound = 0;
  private trailGfx: Phaser.GameObjects.Graphics | null = null;
  private hudText: Phaser.GameObjects.Text | null = null;
  private isPaused = false;
  private rebuildTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('StarConnectScene');
  }

  protected setup(): void {
    this.trailGfx = this.add.graphics().setDepth(2);

    const frame = this.add.graphics().setDepth(0);
    frame.lineStyle(2, 0xffd700, 0.4);
    frame.strokeRect(PLAY_LEFT - 4, PLAY_TOP - 4, PLAY_RIGHT - PLAY_LEFT + 8, PLAY_BOTTOM - PLAY_TOP + 8);

    this.hudText = this.add
      .text(600, 105, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  protected startPlay(): void {
    this.isPaused = false;
    this.constellationIndex = 0;
    this.mistakesThisRound = 0;
    this.spawnConstellation();
  }

  protected setPlayPaused(paused: boolean): void {
    this.isPaused = paused;
    if (this.rebuildTimer) this.rebuildTimer.paused = paused;
  }

  protected teardownPlay(): void {
    this.isPaused = false;
    if (this.rebuildTimer) {
      this.rebuildTimer.destroy();
      this.rebuildTimer = null;
    }
    for (const s of this.stars) s.container.destroy();
    this.stars = [];
    this.targetSequence = [];
    this.trailGfx?.clear();
  }

  protected updatePlaying(time: number, _delta: number): void {
    // Pulse the next target star to hint where to click.
    if (this.isPaused) return;
    const target = this.stars[this.targetSequence[this.nextTargetIdx]];
    if (!target) return;
    const pulse = 0.6 + Math.sin(time * 0.006) * 0.4;
    target.glow.setAlpha(pulse);
    // Decay any briefly-lit stars from successful clicks.
    for (const s of this.stars) {
      if (s.litUntil > 0 && time > s.litUntil) {
        s.litUntil = 0;
        if (this.targetSequence.indexOf(s.index) >= this.nextTargetIdx) {
          s.glow.setAlpha(0);
        }
      }
    }
  }

  private spawnConstellation() {
    this.trailGfx?.clear();
    for (const s of this.stars) s.container.destroy();
    this.stars = [];
    this.targetSequence = [];
    this.nextTargetIdx = 0;
    this.mistakesThisRound = 0;

    const count = Phaser.Math.Between(STAR_COUNT_MIN, STAR_COUNT_MAX);
    const placements = this.placeStars(count);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      this.stars.push(this.createStar(i, p.x, p.y));
    }

    // Random sequence: shuffled order so the constellation isn't trivially adjacent.
    const indices: number[] = [];
    for (let i = 0; i < count; i++) indices.push(i);
    Phaser.Utils.Array.Shuffle(indices);
    this.targetSequence = indices;

    this.refreshTrackerHUD();
  }

  private placeStars(count: number): { x: number; y: number }[] {
    const placed: { x: number; y: number }[] = [];
    let attempts = 0;
    while (placed.length < count && attempts < 400) {
      attempts++;
      const x = Phaser.Math.Between(PLAY_LEFT + 40, PLAY_RIGHT - 40);
      const y = Phaser.Math.Between(PLAY_TOP + 40, PLAY_BOTTOM - 40);
      const ok = placed.every((p) => Phaser.Math.Distance.Between(p.x, p.y, x, y) >= MIN_STAR_SPACING);
      if (ok) placed.push({ x, y });
    }
    return placed;
  }

  private createStar(index: number, x: number, y: number): StarNode {
    const container = this.add.container(x, y).setDepth(5);
    const glow = this.add.graphics();
    glow.fillStyle(0x00f7ff, 1);
    glow.fillCircle(0, 0, 18);
    glow.setAlpha(0);
    container.add(glow);

    const body = this.add.graphics();
    body.fillStyle(0xffd700, 1);
    body.fillRect(-2, -10, 4, 20);
    body.fillRect(-10, -2, 20, 4);
    body.fillStyle(0xffffff, 1);
    body.fillRect(-3, -3, 6, 6);
    container.add(body);

    container.setSize(40, 40);
    container.setInteractive({ useHandCursor: true });
    const node: StarNode = { index, x, y, container, glow, active: true, litUntil: 0 };

    container.on('pointerdown', (event: Phaser.Input.Pointer) => {
      event.event?.stopPropagation?.();
      if (this.isPaused || this.phase !== 'playing') return;
      if (!node.active) return;
      this.handleStarClick(node);
    });

    return node;
  }

  private handleStarClick(node: StarNode) {
    const expected = this.targetSequence[this.nextTargetIdx];
    if (node.index === expected) {
      this.addScore(POINTS_PER_STAR);
      node.litUntil = this.time.now + 1200;
      node.glow.setAlpha(1);
      this.drawTrail();
      this.nextTargetIdx += 1;

      if (this.nextTargetIdx >= this.targetSequence.length) {
        this.completeConstellation();
      } else {
        this.refreshTrackerHUD();
      }
    } else {
      this.mistakesThisRound += 1;
      this.addScore(-2);
      this.flashMiss(node);
      this.refreshTrackerHUD();
    }
  }

  private drawTrail() {
    const g = this.trailGfx;
    if (!g) return;
    g.clear();
    g.lineStyle(2, 0x00f7ff, 0.85);
    for (let i = 0; i < this.nextTargetIdx; i++) {
      const a = this.stars[this.targetSequence[i]];
      const b = this.stars[this.targetSequence[i + 1]];
      if (!a || !b) continue;
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  private completeConstellation() {
    this.constellationIndex += 1;
    let award = POINTS_PER_CONSTELLATION;
    if (this.mistakesThisRound === 0) award += PERFECT_BONUS;
    this.addScore(award);

    // Final flourish: connect last star to first to "close" the shape.
    const g = this.trailGfx;
    if (g && this.stars.length > 0) {
      const first = this.stars[this.targetSequence[0]];
      const last = this.stars[this.targetSequence[this.targetSequence.length - 1]];
      if (first && last) {
        g.lineStyle(2, 0xff00ff, 0.8);
        g.lineBetween(last.x, last.y, first.x, first.y);
      }
    }

    this.rebuildTimer = this.time.delayedCall(650, () => {
      if (this.phase === 'playing') this.spawnConstellation();
      this.rebuildTimer = null;
    });
    this.refreshTrackerHUD();
  }

  private flashMiss(node: StarNode) {
    const flash = this.add.graphics().setDepth(10);
    flash.fillStyle(0xff3344, 0.8);
    flash.fillCircle(node.x, node.y, 14);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });
  }

  private refreshTrackerHUD() {
    if (!this.hudText) return;
    const total = this.targetSequence.length;
    const done = this.nextTargetIdx;
    const perfectTag = this.mistakesThisRound === 0 ? '  PERFECT' : '';
    this.hudText.setText(
      `CONSTELLATION ${this.constellationIndex + 1}  ${done}/${total}${perfectTag}`,
    );
  }
}
