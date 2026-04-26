import Phaser from 'phaser';
import { MinigameScene } from './MinigameScene';

interface Tile {
  index: number;
  symbol: number;
  flipped: boolean;
  matched: boolean;
  container: Phaser.GameObjects.Container;
  faceDown: Phaser.GameObjects.Graphics;
  faceUp: Phaser.GameObjects.Container;
}

const GRID_COLS = 4;
const GRID_ROWS = 4;
const TILE_SIZE = 110;
const TILE_GAP = 14;
const PAIR_BASE_POINTS = 12;
const STREAK_BONUS = 4;
const MISMATCH_PENALTY = 1;
const FLIP_BACK_DELAY_MS = 700;
const ROUND_BONUS_PER_BOARD = 30;

// Symbols are pixel-art mood glyphs drawn with primitives so we don't need new assets.
const SYMBOL_COUNT = (GRID_COLS * GRID_ROWS) / 2; // 8 unique symbols
const SYMBOL_PALETTE: number[] = [
  0xff66aa, 0xffd700, 0x00f7ff, 0x66ff88,
  0x9966ff, 0xff8844, 0x44ddff, 0xff4466,
];

export class MemoryMatchScene extends MinigameScene {
  private tiles: Tile[] = [];
  private firstPick: Tile | null = null;
  private secondPick: Tile | null = null;
  private inputLocked = false;
  private isPaused = false;
  private streak = 0;
  private matchedCount = 0;
  private resolveTimer: Phaser.Time.TimerEvent | null = null;
  private boardOriginX = 0;
  private boardOriginY = 0;
  private statusText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('MemoryMatchScene');
  }

  protected setup(): void {
    const boardW = GRID_COLS * TILE_SIZE + (GRID_COLS - 1) * TILE_GAP;
    const boardH = GRID_ROWS * TILE_SIZE + (GRID_ROWS - 1) * TILE_GAP;
    this.boardOriginX = (1200 - boardW) / 2 + TILE_SIZE / 2;
    this.boardOriginY = 130 + TILE_SIZE / 2;

    const frame = this.add.graphics().setDepth(0);
    frame.lineStyle(2, 0xff66aa, 0.45);
    frame.strokeRect(
      this.boardOriginX - TILE_SIZE / 2 - 8,
      this.boardOriginY - TILE_SIZE / 2 - 8,
      boardW + 16,
      boardH + 16,
    );

    this.statusText = this.add
      .text(600, 110, '', {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '10px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.refreshStatus();
  }

  protected startPlay(): void {
    this.isPaused = false;
    this.streak = 0;
    this.matchedCount = 0;
    this.firstPick = null;
    this.secondPick = null;
    this.inputLocked = false;
    this.buildBoard();
    this.refreshStatus();
  }

  protected setPlayPaused(paused: boolean): void {
    this.isPaused = paused;
    if (this.resolveTimer) this.resolveTimer.paused = paused;
  }

  protected teardownPlay(): void {
    this.isPaused = false;
    this.firstPick = null;
    this.secondPick = null;
    this.inputLocked = false;
    if (this.resolveTimer) {
      this.resolveTimer.destroy();
      this.resolveTimer = null;
    }
    for (const t of this.tiles) t.container.destroy();
    this.tiles = [];
  }

  protected updatePlaying(_time: number, _delta: number): void {
    // No per-frame work beyond input handling.
  }

  private buildBoard() {
    for (const t of this.tiles) t.container.destroy();
    this.tiles = [];

    const symbols: number[] = [];
    for (let i = 0; i < SYMBOL_COUNT; i++) symbols.push(i, i);
    Phaser.Utils.Array.Shuffle(symbols);

    for (let i = 0; i < symbols.length; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const tx = this.boardOriginX + col * (TILE_SIZE + TILE_GAP);
      const ty = this.boardOriginY + row * (TILE_SIZE + TILE_GAP);
      this.tiles.push(this.createTile(i, symbols[i], tx, ty));
    }
  }

  private createTile(index: number, symbol: number, x: number, y: number): Tile {
    const container = this.add.container(x, y).setDepth(5);

    const faceDown = this.add.graphics();
    faceDown.fillStyle(0x1a0033, 1);
    faceDown.fillRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    faceDown.lineStyle(2, 0x00f7ff, 0.85);
    faceDown.strokeRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    faceDown.lineStyle(1, 0xff00ff, 0.7);
    faceDown.strokeRect(-TILE_SIZE / 2 + 6, -TILE_SIZE / 2 + 6, TILE_SIZE - 12, TILE_SIZE - 12);
    // Pixel rune in center while face-down
    faceDown.fillStyle(0xff00ff, 0.7);
    faceDown.fillRect(-6, -10, 12, 4);
    faceDown.fillRect(-2, -6, 4, 12);
    container.add(faceDown);

    const faceUp = this.add.container(0, 0);
    faceUp.setVisible(false);
    const upBg = this.add.graphics();
    upBg.fillStyle(0x0a0015, 1);
    upBg.fillRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    upBg.lineStyle(2, 0xffd700, 1);
    upBg.strokeRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    faceUp.add(upBg);
    faceUp.add(this.drawSymbol(symbol));
    container.add(faceUp);

    container.setSize(TILE_SIZE, TILE_SIZE);
    container.setInteractive({ useHandCursor: true });
    const tile: Tile = {
      index,
      symbol,
      flipped: false,
      matched: false,
      container,
      faceDown,
      faceUp,
    };
    container.on('pointerdown', (event: Phaser.Input.Pointer) => {
      event.event?.stopPropagation?.();
      this.handleTileClick(tile);
    });
    return tile;
  }

  private drawSymbol(symbol: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const color = SYMBOL_PALETTE[symbol % SYMBOL_PALETTE.length];
    g.fillStyle(color, 1);
    // Each symbol is a unique pixel-art mood glyph (variant per index).
    switch (symbol % 8) {
      case 0: // Sparkle star
        g.fillRect(-4, -22, 8, 44);
        g.fillRect(-22, -4, 44, 8);
        g.fillRect(-12, -12, 24, 24);
        break;
      case 1: // Crescent moon
        g.fillCircle(0, 0, 22);
        g.fillStyle(0x0a0015, 1);
        g.fillCircle(7, -3, 18);
        break;
      case 2: // Diamond
        g.fillTriangle(0, -22, -22, 0, 0, 22);
        g.fillTriangle(0, -22, 22, 0, 0, 22);
        break;
      case 3: // Flame
        g.fillTriangle(-14, 18, 0, -22, 14, 18);
        g.fillStyle(0xffd700, 1);
        g.fillTriangle(-7, 14, 0, -8, 7, 14);
        break;
      case 4: // Heart
        g.fillCircle(-9, -4, 11);
        g.fillCircle(9, -4, 11);
        g.fillTriangle(-19, 0, 19, 0, 0, 22);
        break;
      case 5: // Lightning
        g.fillTriangle(-6, -22, 12, -2, -2, -2);
        g.fillTriangle(2, 22, -12, 2, 2, 2);
        break;
      case 6: // Eye
        g.fillEllipse(0, 0, 44, 26);
        g.fillStyle(0x0a0015, 1);
        g.fillCircle(0, 0, 8);
        break;
      case 7: // Cluster
        g.fillCircle(-10, -8, 8);
        g.fillCircle(10, -8, 8);
        g.fillCircle(-10, 10, 8);
        g.fillCircle(10, 10, 8);
        break;
    }
    return g;
  }

  private handleTileClick(tile: Tile) {
    if (this.isPaused || this.inputLocked) return;
    if (this.phase !== 'playing') return;
    if (tile.matched || tile.flipped) return;

    this.flipTile(tile, true);
    if (!this.firstPick) {
      this.firstPick = tile;
      return;
    }
    this.secondPick = tile;
    this.inputLocked = true;
    this.resolvePair();
  }

  private flipTile(tile: Tile, faceUp: boolean) {
    tile.flipped = faceUp;
    tile.faceDown.setVisible(!faceUp);
    tile.faceUp.setVisible(faceUp);
    this.tweens.add({
      targets: tile.container,
      scaleX: { from: 0.85, to: 1 },
      duration: 120,
    });
  }

  private resolvePair() {
    const a = this.firstPick;
    const b = this.secondPick;
    if (!a || !b) return;

    if (a.symbol === b.symbol) {
      a.matched = true;
      b.matched = true;
      this.streak += 1;
      this.matchedCount += 1;
      const points = PAIR_BASE_POINTS + Math.max(0, this.streak - 1) * STREAK_BONUS;
      this.addScore(points);
      this.flashMatch(a);
      this.flashMatch(b);
      this.firstPick = null;
      this.secondPick = null;
      this.inputLocked = false;
      this.refreshStatus();
      if (this.matchedCount === SYMBOL_COUNT) {
        this.addScore(ROUND_BONUS_PER_BOARD);
        this.streak = 0;
        this.matchedCount = 0;
        this.refreshStatus();
        // Re-deal a new shuffled board so players can keep scoring within the round.
        this.time.delayedCall(450, () => {
          if (this.phase === 'playing') this.buildBoard();
        });
      }
    } else {
      this.streak = 0;
      this.addScore(-MISMATCH_PENALTY);
      this.refreshStatus();
      this.resolveTimer = this.time.delayedCall(FLIP_BACK_DELAY_MS, () => {
        if (this.phase !== 'playing') return;
        if (a && !a.matched) this.flipTile(a, false);
        if (b && !b.matched) this.flipTile(b, false);
        this.firstPick = null;
        this.secondPick = null;
        this.inputLocked = false;
        this.resolveTimer = null;
      });
    }
  }

  private flashMatch(tile: Tile) {
    const flash = this.add.graphics().setDepth(8);
    flash.fillStyle(0xffd700, 0.55);
    flash.fillRect(
      tile.container.x - TILE_SIZE / 2,
      tile.container.y - TILE_SIZE / 2,
      TILE_SIZE,
      TILE_SIZE,
    );
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });
  }

  private refreshStatus() {
    if (!this.statusText) return;
    const streakLabel = this.streak > 1 ? `  STREAK x${this.streak}` : '';
    this.statusText.setText(`PAIRS  ${this.matchedCount}/${SYMBOL_COUNT}${streakLabel}`);
  }
}
