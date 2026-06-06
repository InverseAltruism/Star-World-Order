import * as Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';

// returnRoom is opaque to the minigame scene — it just echoes it back on
// exit. V2 passes a Title-Case `RoomKey`; V3 passes a kebab-case
// `BuildingId`. The owning room scene matches on whichever format it uses.
export interface MinigameLaunchData {
  gameId: string;
  tokenId: number | null;
  returnRoom: string;
  returnTo: { x: number; y: number };
  durationSeconds?: number;
  title?: string;
  /** Arcade mode: one wager per launch — hide "PLAY AGAIN" (replay has no stake). */
  singlePlay?: boolean;
}

export interface MinigameCompletePayload {
  gameId: string;
  tokenId: number | null;
  score: number;
  durationSeconds: number;
}

export interface MinigameResultUpdate {
  gameId: string;
  starAwarded: number;
  personalBest: number;
  isFirstPlay: boolean;
  isNewPersonalBest: boolean;
  totalPlays: number;
}

type Phase = 'intro' | 'playing' | 'paused' | 'result';

const SCREEN_W = 1200;
const SCREEN_H = 900;

export abstract class MinigameScene extends Phaser.Scene {
  protected gameId: string = '';
  protected gameTitle: string = 'MINIGAME';
  protected tokenId: number | null = null;
  protected returnRoom: string | null = null;
  protected returnTo: { x: number; y: number } = { x: 600, y: 800 };
  protected durationSeconds: number = 60;
  protected singlePlay: boolean = false;
  protected score: number = 0;
  protected phase: Phase = 'intro';
  protected timeRemaining: number = 0;
  protected lastTickAt: number = 0;
  protected exiting = false;

  // HUD elements (managed by base)
  private scoreText: Phaser.GameObjects.Text | null = null;
  private timerText: Phaser.GameObjects.Text | null = null;
  private titleText: Phaser.GameObjects.Text | null = null;
  private overlayContainer: Phaser.GameObjects.Container | null = null;

  // Result-screen state populated via 'minigame-result-update'
  private serverStarAwarded: number | null = null;
  private serverPersonalBest: number | null = null;
  private serverIsNewPB: boolean = false;
  private serverIsFirstPlay: boolean = false;
  private resultStatusText: Phaser.GameObjects.Text | null = null;
  private resultDetailText: Phaser.GameObjects.Text | null = null;

  constructor(key: string) {
    super({ key });
  }

  create(data: MinigameLaunchData) {
    this.gameId = data.gameId;
    this.tokenId = data.tokenId;
    this.returnRoom = data.returnRoom;
    this.returnTo = data.returnTo;
    this.durationSeconds = Math.max(15, Math.min(data.durationSeconds ?? 60, 120));
    this.gameTitle = data.title ?? this.gameId.toUpperCase();
    this.singlePlay = data.singlePlay ?? false;
    this.score = 0;
    this.phase = 'intro';
    this.timeRemaining = this.durationSeconds;
    this.exiting = false;
    this.serverStarAwarded = null;
    this.serverPersonalBest = null;
    this.serverIsNewPB = false;
    this.serverIsFirstPlay = false;

    this.cameras.main.setBackgroundColor('#0a0015');
    this.cameras.main.fadeIn(250, 0, 0, 0);

    this.drawBackdrop();
    this.setupHUD();
    this.setup();
    this.showIntro();

    this.input.keyboard!.on('keydown-ESC', () => this.handleEscape());
    this.input.keyboard!.on('keydown-P', () => this.togglePause());

    EventBus.on('minigame-result-update', this.handleResultUpdate, this);
  }

  /** Subclass hook — preload assets and create game objects (idle state). */
  protected abstract setup(): void;

  /** Subclass hook — start the active gameplay logic. Called when phase → playing. */
  protected abstract startPlay(): void;

  /** Subclass hook — pause/resume logic for active gameplay. */
  protected abstract setPlayPaused(paused: boolean): void;

  /** Subclass hook — clean up gameplay objects/timers when entering result phase. */
  protected abstract teardownPlay(): void;

  /** Subclass hook — per-frame update during the playing phase only. */
  protected abstract updatePlaying(_time: number, _delta: number): void;

  /** Subclasses call this whenever they want to add to the score. */
  protected addScore(delta: number) {
    if (this.phase !== 'playing') return;
    this.score = Math.max(0, Math.floor(this.score + delta));
    this.refreshHUD();
  }

  // ----- Phase management ---------------------------------------------------

  private showIntro() {
    this.phase = 'intro';
    this.refreshHUD();
    this.showOverlay({
      title: this.gameTitle,
      lines: [
        `${this.durationSeconds}s round.`,
        'Score points to earn STAR XP.',
        'First play of the round grants a bonus.',
      ],
      buttons: [
        { label: 'BEGIN [SPACE]', onClick: () => this.beginPlay() },
        { label: 'EXIT [ESC]', onClick: () => this.requestExit() },
      ],
    });
    const space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    space.once('down', () => {
      if (this.phase === 'intro') this.beginPlay();
    });
  }

  private beginPlay() {
    this.hideOverlay();
    this.phase = 'playing';
    this.timeRemaining = this.durationSeconds;
    this.lastTickAt = this.time.now;
    this.refreshHUD();
    this.startPlay();
  }

  private togglePause() {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.setPlayPaused(true);
      this.showOverlay({
        title: 'PAUSED',
        lines: [`Score: ${this.score}`, `Time left: ${Math.ceil(this.timeRemaining)}s`],
        buttons: [
          { label: 'RESUME [P]', onClick: () => this.togglePause() },
          { label: 'EXIT [ESC]', onClick: () => this.requestExit() },
        ],
      });
    } else if (this.phase === 'paused') {
      this.hideOverlay();
      this.phase = 'playing';
      this.lastTickAt = this.time.now;
      this.setPlayPaused(false);
    }
  }

  private finishPlay() {
    if (this.phase === 'result') return;
    this.phase = 'result';
    this.teardownPlay();
    this.refreshHUD();
    this.showResultScreen();

    const payload: MinigameCompletePayload = {
      gameId: this.gameId,
      tokenId: this.tokenId,
      score: this.score,
      durationSeconds: this.durationSeconds,
    };
    EventBus.emit('minigame-complete', payload);
  }

  private handleResultUpdate(update: MinigameResultUpdate) {
    if (update.gameId !== this.gameId) return;
    this.serverStarAwarded = update.starAwarded;
    this.serverPersonalBest = update.personalBest;
    this.serverIsNewPB = update.isNewPersonalBest;
    this.serverIsFirstPlay = update.isFirstPlay;
    this.refreshResultText();
  }

  private handleEscape() {
    if (this.phase === 'playing') {
      this.togglePause();
      return;
    }
    if (this.phase === 'paused' || this.phase === 'intro' || this.phase === 'result') {
      this.requestExit();
    }
  }

  private requestExit() {
    if (this.exiting) return;
    this.exiting = true;
    if (this.phase === 'playing') {
      // Skip scoring submission — player bailed mid-round.
      this.teardownPlay();
    }
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      EventBus.emit('minigame-exit', {
        gameId: this.gameId,
        sceneKey: this.scene.key,
        returnRoom: this.returnRoom,
        returnTo: this.returnTo,
      });
    });
  }

  // ----- Frame loop ---------------------------------------------------------

  update(time: number, delta: number) {
    if (this.phase !== 'playing') return;
    const dtSec = delta / 1000;
    this.timeRemaining -= dtSec;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.refreshHUD();
      this.finishPlay();
      return;
    }
    this.refreshHUD();
    this.updatePlaying(time, delta);
  }

  // ----- Pixel-art HUD/overlay primitives -----------------------------------

  private drawBackdrop() {
    const g = this.add.graphics().setDepth(-5).setScrollFactor(0);
    g.fillGradientStyle(0x1a0033, 0x1a0033, 0x0a0015, 0x0a0015, 1);
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Synthwave grid lines for retro feel
    g.lineStyle(1, 0x00f7ff, 0.15);
    for (let x = 0; x < SCREEN_W; x += 40) {
      g.lineBetween(x, 0, x, SCREEN_H);
    }
    for (let y = 0; y < SCREEN_H; y += 40) {
      g.lineBetween(0, y, SCREEN_W, y);
    }
  }

  private setupHUD() {
    this.titleText = this.add
      .text(SCREEN_W / 2, 24, this.gameTitle, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '16px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: 'rgba(10,0,21,0.75)',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);

    this.scoreText = this.add
      .text(20, 56, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '18px',
        color: '#00f7ff',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: 'rgba(10,0,21,0.75)',
        padding: { x: 10, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.timerText = this.add
      .text(SCREEN_W - 20, 56, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '20px',
        color: '#ff66aa',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: 'rgba(10,0,21,0.75)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    this.refreshHUD();
  }

  private refreshHUD() {
    if (this.scoreText) this.scoreText.setText(`SCORE  ${this.score}`);
    if (this.timerText) {
      const sec = Math.ceil(this.timeRemaining);
      this.timerText.setText(`TIME  ${sec}s`);
      this.timerText.setColor(sec <= 10 ? '#ff3344' : '#ff66aa');
    }
  }

  private clearOverlay() {
    if (this.overlayContainer) {
      this.overlayContainer.destroy();
      this.overlayContainer = null;
    }
    this.resultStatusText = null;
    this.resultDetailText = null;
  }

  private hideOverlay() {
    this.clearOverlay();
  }

  private showOverlay(opts: {
    title: string;
    lines: string[];
    buttons: { label: string; onClick: () => void }[];
    extra?: (container: Phaser.GameObjects.Container) => void;
  }) {
    this.clearOverlay();
    const w = 560;
    const h = 380;
    const x = SCREEN_W / 2;
    const y = SCREEN_H / 2;
    const container = this.add.container(x, y).setScrollFactor(0).setDepth(200);

    // Pixel-art panel: outer cyan stroke + inner dark fill + accent border
    const panelG = this.add.graphics();
    panelG.fillStyle(0x0a0015, 0.95);
    panelG.fillRect(-w / 2, -h / 2, w, h);
    panelG.lineStyle(3, 0x00f7ff, 1);
    panelG.strokeRect(-w / 2, -h / 2, w, h);
    panelG.lineStyle(1, 0xff00ff, 0.8);
    panelG.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
    container.add(panelG);

    const titleObj = this.add
      .text(0, -h / 2 + 28, opts.title, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '18px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);
    container.add(titleObj);

    opts.lines.forEach((line, i) => {
      const lineObj = this.add
        .text(0, -h / 2 + 80 + i * 26, line, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '10px',
          color: '#00f7ff',
          stroke: '#000000',
          strokeThickness: 2,
          align: 'center',
        })
        .setOrigin(0.5, 0);
      container.add(lineObj);
    });

    opts.extra?.(container);

    const btnY = h / 2 - 60;
    const btnSpacing = 220;
    const btnStartX = -((opts.buttons.length - 1) * btnSpacing) / 2;
    opts.buttons.forEach((btn, i) => {
      const bx = btnStartX + i * btnSpacing;
      const btnG = this.add.graphics();
      btnG.fillStyle(0x9966ff, 0.25);
      btnG.fillRect(-90, -16, 180, 32);
      btnG.lineStyle(2, 0x9966ff, 1);
      btnG.strokeRect(-90, -16, 180, 32);
      const label = this.add
        .text(0, 0, btn.label, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '10px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      const btnContainer = this.add.container(bx, btnY, [btnG, label]);
      btnContainer.setSize(180, 32);
      btnContainer.setInteractive({ useHandCursor: true });
      btnContainer.on('pointerover', () => label.setColor('#ffd700'));
      btnContainer.on('pointerout', () => label.setColor('#ffffff'));
      btnContainer.on('pointerdown', () => btn.onClick());
      container.add(btnContainer);
    });

    this.overlayContainer = container;
  }

  private showResultScreen() {
    // Arcade (singlePlay) mode owns the result UI in React (clear win/loss +
    // payout + multiplier), so the in-canvas overlay stays minimal — no
    // "STAR +calculating" / "Personal Best" lines (those were the ugly,
    // confusing bit). The world high-score mode keeps the full overlay.
    this.showOverlay({
      title: 'ROUND COMPLETE',
      lines: this.singlePlay
        ? [`Score: ${this.score}`]
        : [`Score: ${this.score}`, '', 'STAR  +calculating...', 'Personal Best: ...'],
      buttons: this.singlePlay
        ? [{ label: 'BACK TO GAMES [ESC]', onClick: () => this.requestExit() }]
        : [
            { label: 'PLAY AGAIN [SPACE]', onClick: () => this.replay() },
            { label: 'EXIT TO ROOM [ESC]', onClick: () => this.requestExit() },
          ],
      extra: this.singlePlay ? undefined : (container) => {
        // Replace the placeholder lines with named refs we can update later.
        const status = this.add
          .text(0, -20, 'STAR  +calculating...', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
            color: '#ffd700',
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5);
        const detail = this.add
          .text(0, 14, 'Personal Best: ...', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '9px',
            color: '#9966ff',
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        container.add([status, detail]);
        this.resultStatusText = status;
        this.resultDetailText = detail;
        this.refreshResultText();
      },
    });

    if (!this.singlePlay) {
      const space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      space.once('down', () => {
        if (this.phase === 'result') this.replay();
      });
    }
  }

  private refreshResultText() {
    if (!this.resultStatusText || !this.resultDetailText) return;
    if (this.serverStarAwarded === null) {
      this.resultStatusText.setText('STAR  +calculating...');
      this.resultDetailText.setText('Saving score...');
      return;
    }
    const bonusTag = this.serverIsFirstPlay ? ' (first-play bonus!)' : '';
    this.resultStatusText.setText(`STAR  +${this.serverStarAwarded}${bonusTag}`);
    const pb = this.serverPersonalBest ?? this.score;
    const pbTag = this.serverIsNewPB ? '  ★ NEW BEST' : '';
    this.resultDetailText.setText(`Personal Best: ${pb}${pbTag}`);
  }

  private replay() {
    this.score = 0;
    this.serverStarAwarded = null;
    this.serverPersonalBest = null;
    this.serverIsNewPB = false;
    this.serverIsFirstPlay = false;
    this.refreshResultText();
    this.beginPlay();
  }

  shutdown() {
    EventBus.off('minigame-result-update', this.handleResultUpdate, this);
    this.clearOverlay();
  }
}
