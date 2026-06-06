import * as Phaser from 'phaser';
import { MinigameScene } from './MinigameScene';

type Direction = 'left' | 'up' | 'down' | 'right';

interface RecipeNote {
  container: Phaser.GameObjects.Container;
  direction: Direction;
  x: number;
  consumed: boolean;
}

const TARGET_X = 240;
const TARGET_Y = 540;
const SPAWN_X = 1200;
const NOTE_SIZE = 64;
const NOTE_SPEED = 280; // px/sec
const SPEED_RAMP_PER_HIT = 4;
const MAX_SPEED = 480;
const SPAWN_INTERVAL_MS = 820;
const PERFECT_WINDOW = 28;
const GREAT_WINDOW = 60;
const GOOD_WINDOW = 100;
const PERFECT_POINTS = 12;
const GREAT_POINTS = 7;
const GOOD_POINTS = 3;
const MISS_PENALTY = 4;
const STREAK_BONUS_CAP = 5;

const DIRECTIONS: Direction[] = ['left', 'up', 'down', 'right'];

const DIRECTION_COLORS: Record<Direction, number> = {
  left: 0xff66aa,
  up: 0xffd700,
  down: 0x66ff88,
  right: 0x00f7ff,
};

const KEY_FOR_DIRECTION: Record<Direction, number> = {
  left: Phaser.Input.Keyboard.KeyCodes.LEFT,
  up: Phaser.Input.Keyboard.KeyCodes.UP,
  down: Phaser.Input.Keyboard.KeyCodes.DOWN,
  right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
};

export class CookingRhythmScene extends MinigameScene {
  private notes: RecipeNote[] = [];
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private speed = NOTE_SPEED;
  private streak = 0;
  private isPaused = false;
  private feedbackText: Phaser.GameObjects.Text | null = null;
  private feedbackHideAt = 0;
  private targetGfx: Phaser.GameObjects.Graphics | null = null;
  private keyHandlers: Record<Direction, Phaser.Input.Keyboard.Key | null> = {
    left: null,
    up: null,
    down: null,
    right: null,
  };

  constructor() {
    super('CookingRhythmScene');
  }

  protected setup(): void {
    this.targetGfx = this.add.graphics().setDepth(2);
    this.drawTargetZone();

    this.add
      .text(600, 220, 'COOK THE RECIPE', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: '#ffaa44',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(600, 700, 'PRESS ARROW KEYS WHEN NOTES REACH THE PAN', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#ff66aa',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.feedbackText = this.add
      .text(TARGET_X, TARGET_Y - 110, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.drawPan(TARGET_X, TARGET_Y + 110);

    const kb = this.input.keyboard!;
    this.keyHandlers.left = kb.addKey(KEY_FOR_DIRECTION.left);
    this.keyHandlers.up = kb.addKey(KEY_FOR_DIRECTION.up);
    this.keyHandlers.down = kb.addKey(KEY_FOR_DIRECTION.down);
    this.keyHandlers.right = kb.addKey(KEY_FOR_DIRECTION.right);
  }

  protected startPlay(): void {
    this.isPaused = false;
    this.speed = NOTE_SPEED;
    this.streak = 0;
    this.feedbackHideAt = 0;
    if (this.feedbackText) this.feedbackText.setText('');
    this.spawnTimer = this.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this.spawnNote(),
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
    for (const n of this.notes) n.container.destroy();
    this.notes = [];
    this.streak = 0;
    if (this.feedbackText) this.feedbackText.setText('');
  }

  protected updatePlaying(time: number, delta: number): void {
    if (this.isPaused) return;
    const dt = delta / 1000;

    for (const note of this.notes) {
      if (note.consumed) continue;
      note.x -= this.speed * dt;
      note.container.x = note.x;
      if (note.x < TARGET_X - GOOD_WINDOW - 10) {
        note.consumed = true;
        this.streak = 0;
        this.addScore(-MISS_PENALTY);
        this.showFeedback('MISS', '#ff3344');
        this.flashTarget(0xff3344);
      }
    }
    this.notes = this.notes.filter((n) => !n.consumed || n.container.scene);
    // Cleanup destroyed
    for (let i = this.notes.length - 1; i >= 0; i--) {
      if (this.notes[i].consumed) {
        this.notes[i].container.destroy();
        this.notes.splice(i, 1);
      }
    }

    for (const dir of DIRECTIONS) {
      const key = this.keyHandlers[dir];
      if (key && Phaser.Input.Keyboard.JustDown(key)) {
        this.handleKeyPress(dir);
      }
    }

    if (this.feedbackHideAt > 0 && time > this.feedbackHideAt && this.feedbackText) {
      this.feedbackText.setAlpha(Math.max(0, this.feedbackText.alpha - delta / 250));
    }
  }

  private handleKeyPress(dir: Direction) {
    let best: RecipeNote | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const note of this.notes) {
      if (note.consumed || note.direction !== dir) continue;
      const dist = Math.abs(note.x - TARGET_X);
      if (dist < bestDist) {
        best = note;
        bestDist = dist;
      }
    }
    if (!best || bestDist > GOOD_WINDOW) {
      this.streak = 0;
      this.addScore(-MISS_PENALTY);
      this.showFeedback('OFF-BEAT', '#ff3344');
      this.flashTarget(0xff3344);
      return;
    }

    let label: string;
    let color: string;
    let points: number;
    if (bestDist <= PERFECT_WINDOW) {
      label = 'PERFECT';
      color = '#ffd700';
      points = PERFECT_POINTS;
    } else if (bestDist <= GREAT_WINDOW) {
      label = 'GREAT';
      color = '#00f7ff';
      points = GREAT_POINTS;
    } else {
      label = 'GOOD';
      color = '#9966ff';
      points = GOOD_POINTS;
    }

    this.streak += 1;
    const streakBonus = Math.min(this.streak, STREAK_BONUS_CAP);
    if (streakBonus > 1) points += streakBonus - 1;
    this.addScore(points);
    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP_PER_HIT);

    best.consumed = true;
    this.tweens.add({
      targets: best.container,
      alpha: 0,
      scale: 1.4,
      duration: 180,
      onComplete: () => best!.container.destroy(),
    });

    this.showFeedback(label, color);
    this.flashTarget(DIRECTION_COLORS[dir]);
  }

  private spawnNote() {
    if (this.isPaused) return;
    const dir = Phaser.Utils.Array.GetRandom(DIRECTIONS) as Direction;
    const container = this.add.container(SPAWN_X, TARGET_Y).setDepth(5);
    container.add(this.drawNote(dir));
    const note: RecipeNote = {
      container,
      direction: dir,
      x: SPAWN_X,
      consumed: false,
    };
    this.notes.push(note);
  }

  private drawNote(dir: Direction): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const color = DIRECTION_COLORS[dir];
    const half = NOTE_SIZE / 2;

    g.fillStyle(0x110022, 1);
    g.fillRect(-half, -half, NOTE_SIZE, NOTE_SIZE);
    g.lineStyle(2, color, 1);
    g.strokeRect(-half, -half, NOTE_SIZE, NOTE_SIZE);
    g.fillStyle(color, 1);

    switch (dir) {
      case 'left':
        g.fillTriangle(-18, 0, 12, -16, 12, 16);
        g.fillRect(8, -5, 14, 10);
        break;
      case 'right':
        g.fillTriangle(18, 0, -12, -16, -12, 16);
        g.fillRect(-22, -5, 14, 10);
        break;
      case 'up':
        g.fillTriangle(0, -18, -16, 12, 16, 12);
        g.fillRect(-5, 8, 10, 14);
        break;
      case 'down':
        g.fillTriangle(0, 18, -16, -12, 16, -12);
        g.fillRect(-5, -22, 10, 14);
        break;
    }
    return g;
  }

  private drawTargetZone() {
    const g = this.targetGfx;
    if (!g) return;
    g.clear();
    // Outer good zone
    g.fillStyle(0x66ff88, 0.18);
    g.fillRect(TARGET_X - GOOD_WINDOW, TARGET_Y - 50, GOOD_WINDOW * 2, 100);
    // Great
    g.fillStyle(0x00f7ff, 0.25);
    g.fillRect(TARGET_X - GREAT_WINDOW, TARGET_Y - 50, GREAT_WINDOW * 2, 100);
    // Perfect
    g.fillStyle(0xffd700, 0.4);
    g.fillRect(TARGET_X - PERFECT_WINDOW, TARGET_Y - 50, PERFECT_WINDOW * 2, 100);
    g.lineStyle(2, 0xffaa44, 0.9);
    g.strokeRect(TARGET_X - GOOD_WINDOW, TARGET_Y - 50, GOOD_WINDOW * 2, 100);
    g.lineStyle(1, 0xffffff, 0.85);
    g.lineBetween(TARGET_X, TARGET_Y - 60, TARGET_X, TARGET_Y + 60);
  }

  private drawPan(x: number, y: number) {
    const g = this.add.graphics().setDepth(1);
    // Pan body
    g.fillStyle(0x303040, 1);
    g.fillEllipse(x, y, 200, 60);
    g.fillStyle(0x505064, 1);
    g.fillEllipse(x, y - 6, 196, 50);
    // Handle
    g.fillStyle(0x885522, 1);
    g.fillRect(x + 88, y - 8, 70, 16);
    g.fillStyle(0xffaa44, 0.85);
    g.fillEllipse(x, y - 14, 160, 18);
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

  private flashTarget(color: number) {
    const flash = this.add.graphics().setDepth(15);
    flash.fillStyle(color, 0.5);
    flash.fillRect(TARGET_X - PERFECT_WINDOW, TARGET_Y - 50, PERFECT_WINDOW * 2, 100);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 250,
      onComplete: () => flash.destroy(),
    });
  }
}
