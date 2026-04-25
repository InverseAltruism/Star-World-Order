import Phaser from 'phaser';
import { MinigameScene } from './MinigameScene';

interface TriviaQuestion {
  prompt: string;
  options: string[];
  answerIndex: number;
}

interface OptionButton {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  index: number;
}

const QUESTIONS: TriviaQuestion[] = [
  {
    prompt: 'Where do Skrumpey moods reveal themselves?',
    options: ['Aura Forge', 'Hot Springs', 'Cosmic Library', 'Dream Hollow'],
    answerIndex: 1,
  },
  {
    prompt: 'Which room is dedicated to charting constellations?',
    options: ['Observatory', 'Star Garden', 'Nebula Kitchen', 'Aura Forge'],
    answerIndex: 0,
  },
  {
    prompt: 'Who tends the Star Garden?',
    options: ['Pyrix', 'Astris', 'Flora', 'Somnia'],
    answerIndex: 2,
  },
  {
    prompt: 'In which room do auras meet hammer and anvil?',
    options: ['Training Grounds', 'Dream Hollow', 'Aura Forge', 'Hot Springs'],
    answerIndex: 2,
  },
  {
    prompt: 'What is the cosmic chef called?',
    options: ['Chef Cosmo', 'Lorekeeper', 'Ember', 'Valor'],
    answerIndex: 0,
  },
  {
    prompt: 'Where do dreams gather as orbs to be caught?',
    options: ['Star Garden', 'Dream Hollow', 'Cosmic Library', 'Observatory'],
    answerIndex: 1,
  },
  {
    prompt: 'Who guards the lore of the Sanctuary?',
    options: ['Lorekeeper', 'Ember', 'Astris', 'Flora'],
    answerIndex: 0,
  },
  {
    prompt: 'Which room is for Skrumpey leveling and obstacle courses?',
    options: ['Training Grounds', 'Aura Forge', 'Nebula Kitchen', 'Observatory'],
    answerIndex: 0,
  },
  {
    prompt: 'A Star Skrumpey carries which sacred trait?',
    options: ['Aura', 'Constellation', 'Bloom', 'Streak'],
    answerIndex: 1,
  },
  {
    prompt: 'How do Star holders shape the DAO?',
    options: ['By staking MON', 'One Skrumpey, one vote', 'By burning tiles', 'By cooking'],
    answerIndex: 1,
  },
  {
    prompt: 'Which currency rewards minigame play?',
    options: ['XP', 'STAR', 'MON', 'AURA'],
    answerIndex: 1,
  },
  {
    prompt: 'Who first welcomes new travelers at spawn?',
    options: ['Spawn Fox', 'Quest Board', 'Astris', 'Somnia'],
    answerIndex: 0,
  },
  {
    prompt: 'What chain hosts the Star World Order?',
    options: ['Solana', 'Ethereum', 'Monad', 'Polygon'],
    answerIndex: 2,
  },
  {
    prompt: 'Where does Pyrix tend his fires?',
    options: ['Aura Forge', 'Nebula Kitchen', 'Hot Springs', 'Training Grounds'],
    answerIndex: 0,
  },
  {
    prompt: 'A perfect minigame round earns what kind of bonus?',
    options: ['XP only', 'A streak multiplier', 'Free MON', 'A new room'],
    answerIndex: 1,
  },
];

const PROMPT_X = 600;
const PROMPT_Y = 240;
const OPTIONS_START_Y = 410;
const OPTIONS_GAP = 90;
const OPTION_WIDTH = 820;
const OPTION_HEIGHT = 70;

const CORRECT_POINTS = 14;
const WRONG_PENALTY = 4;
const SPEED_BONUS_THRESHOLD_MS = 4000;
const SPEED_BONUS_POINTS = 4;
const STREAK_BONUS_CAP = 5;
const FEEDBACK_LOCK_MS = 850;
const QUESTION_TIME_MS = 10_000;

export class LoreTriviaScene extends MinigameScene {
  private order: number[] = [];
  private cursor = 0;
  private currentQuestion: TriviaQuestion | null = null;
  private promptText: Phaser.GameObjects.Text | null = null;
  private optionButtons: OptionButton[] = [];
  private feedbackText: Phaser.GameObjects.Text | null = null;
  private questionTimerText: Phaser.GameObjects.Text | null = null;
  private questionTimerBar: Phaser.GameObjects.Graphics | null = null;
  private streak = 0;
  private isPaused = false;
  private answerLockedUntil = 0;
  private questionShownAt = 0;
  private questionDeadline = 0;
  private numberKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super('LoreTriviaScene');
  }

  protected setup(): void {
    this.add
      .text(PROMPT_X, 110, 'COSMIC LORE TRIVIA', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: '#8866ff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(PROMPT_X, 160, 'CLICK ANSWER · OR PRESS 1-4', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#9966ff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.promptText = this.add
      .text(PROMPT_X, PROMPT_Y, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '18px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: 980 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Per-question timer: text + a thin progress bar under the prompt.
    this.questionTimerText = this.add
      .text(PROMPT_X, PROMPT_Y + 50, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '12px',
        color: '#00f7ff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(15);
    this.questionTimerBar = this.add.graphics().setDepth(14);

    this.feedbackText = this.add
      .text(PROMPT_X, 800, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    for (let i = 0; i < 4; i++) {
      this.optionButtons.push(this.buildOptionButton(i));
    }

    const kb = this.input.keyboard!;
    this.numberKeys = [
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    ];
  }

  protected startPlay(): void {
    this.isPaused = false;
    this.streak = 0;
    this.answerLockedUntil = 0;
    this.order = QUESTIONS.map((_, i) => i);
    Phaser.Utils.Array.Shuffle(this.order);
    this.cursor = 0;
    if (this.feedbackText) this.feedbackText.setText('');
    this.showNextQuestion();
  }

  protected setPlayPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  protected teardownPlay(): void {
    this.isPaused = false;
    this.streak = 0;
    this.currentQuestion = null;
    if (this.promptText) this.promptText.setText('');
    if (this.feedbackText) this.feedbackText.setText('');
    if (this.questionTimerText) this.questionTimerText.setText('');
    if (this.questionTimerBar) this.questionTimerBar.clear();
    for (const b of this.optionButtons) {
      b.label.setText('');
      this.styleOption(b, 'idle');
    }
  }

  protected updatePlaying(time: number, _delta: number): void {
    if (this.isPaused) return;
    if (time >= this.answerLockedUntil) {
      // Question timeout → mark wrong, move on.
      if (this.currentQuestion && time >= this.questionDeadline) {
        this.timeout();
        return;
      }
      for (let i = 0; i < this.numberKeys.length; i++) {
        if (Phaser.Input.Keyboard.JustDown(this.numberKeys[i])) {
          this.answer(i);
          return;
        }
      }
    }
    this.refreshQuestionTimer(time);
  }

  private refreshQuestionTimer(time: number) {
    if (!this.questionTimerText || !this.questionTimerBar) return;
    if (!this.currentQuestion) {
      this.questionTimerText.setText('');
      this.questionTimerBar.clear();
      return;
    }
    const remaining = Math.max(0, this.questionDeadline - time);
    const seconds = Math.ceil(remaining / 1000);
    this.questionTimerText.setText(`${seconds}s`);
    this.questionTimerText.setColor(seconds <= 3 ? '#ff3344' : '#00f7ff');

    const pct = Math.max(0, Math.min(1, remaining / QUESTION_TIME_MS));
    const barW = 480;
    const barH = 8;
    const barX = PROMPT_X - barW / 2;
    const barY = PROMPT_Y + 70;
    this.questionTimerBar.clear();
    this.questionTimerBar.fillStyle(0x110022, 0.85);
    this.questionTimerBar.fillRect(barX, barY, barW, barH);
    this.questionTimerBar.fillStyle(seconds <= 3 ? 0xff3344 : 0x00f7ff, 0.9);
    this.questionTimerBar.fillRect(barX, barY, Math.floor(barW * pct), barH);
    this.questionTimerBar.lineStyle(1, 0x9966ff, 1);
    this.questionTimerBar.strokeRect(barX, barY, barW, barH);
  }

  private timeout() {
    const q = this.currentQuestion;
    if (!q) return;
    this.streak = 0;
    this.answerLockedUntil = this.time.now + FEEDBACK_LOCK_MS;
    const correctBtn = this.optionButtons[q.answerIndex];
    this.styleOption(correctBtn, 'correct');
    for (const btn of this.optionButtons) {
      if (btn.index !== q.answerIndex) btn.container.setAlpha(0.4);
    }
    this.showFeedback("TIME'S UP", '#ff3344');
    this.time.delayedCall(FEEDBACK_LOCK_MS, () => {
      if (this.phase !== 'playing') return;
      this.showNextQuestion();
    });
  }

  private showNextQuestion() {
    if (this.order.length === 0) return;
    if (this.cursor >= this.order.length) {
      Phaser.Utils.Array.Shuffle(this.order);
      this.cursor = 0;
    }
    const idx = this.order[this.cursor];
    this.cursor += 1;
    const q = QUESTIONS[idx];
    this.currentQuestion = q;
    if (this.promptText) this.promptText.setText(q.prompt);

    for (let i = 0; i < this.optionButtons.length; i++) {
      const btn = this.optionButtons[i];
      btn.label.setText(`${i + 1}. ${q.options[i]}`);
      this.styleOption(btn, 'idle');
      btn.container.setAlpha(1);
    }
    this.questionShownAt = this.time.now;
    this.questionDeadline = this.time.now + QUESTION_TIME_MS;
    this.answerLockedUntil = 0;
    this.refreshQuestionTimer(this.time.now);
  }

  private buildOptionButton(index: number): OptionButton {
    const y = OPTIONS_START_Y + index * OPTIONS_GAP;
    const container = this.add.container(PROMPT_X, y).setDepth(5);
    const bg = this.add.graphics();
    container.add(bg);
    const label = this.add
      .text(0, 0, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    container.add(label);
    container.setSize(OPTION_WIDTH, OPTION_HEIGHT);
    container.setInteractive({ useHandCursor: true });
    const btn: OptionButton = { container, bg, label, index };
    container.on('pointerdown', (event: Phaser.Input.Pointer) => {
      event.event?.stopPropagation?.();
      if (this.phase !== 'playing') return;
      if (this.time.now < this.answerLockedUntil) return;
      this.answer(index);
    });
    container.on('pointerover', () => {
      if (this.time.now < this.answerLockedUntil) return;
      this.styleOption(btn, 'hover');
    });
    container.on('pointerout', () => {
      if (this.time.now < this.answerLockedUntil) return;
      this.styleOption(btn, 'idle');
    });
    this.styleOption(btn, 'idle');
    return btn;
  }

  private styleOption(btn: OptionButton, state: 'idle' | 'hover' | 'correct' | 'wrong') {
    btn.bg.clear();
    let fill = 0x110022;
    let alpha = 0.85;
    let stroke = 0x9966ff;
    if (state === 'hover') {
      fill = 0x2a0044;
      stroke = 0x00f7ff;
    } else if (state === 'correct') {
      fill = 0x115522;
      stroke = 0x66ff88;
      alpha = 0.95;
    } else if (state === 'wrong') {
      fill = 0x551122;
      stroke = 0xff3344;
      alpha = 0.95;
    }
    btn.bg.fillStyle(fill, alpha);
    btn.bg.fillRect(-OPTION_WIDTH / 2, -OPTION_HEIGHT / 2, OPTION_WIDTH, OPTION_HEIGHT);
    btn.bg.lineStyle(2, stroke, 1);
    btn.bg.strokeRect(-OPTION_WIDTH / 2, -OPTION_HEIGHT / 2, OPTION_WIDTH, OPTION_HEIGHT);
    btn.bg.lineStyle(1, 0xff00ff, 0.4);
    btn.bg.strokeRect(-OPTION_WIDTH / 2 + 4, -OPTION_HEIGHT / 2 + 4, OPTION_WIDTH - 8, OPTION_HEIGHT - 8);
  }

  private answer(index: number) {
    const q = this.currentQuestion;
    if (!q) return;
    const elapsed = this.time.now - this.questionShownAt;
    const correct = index === q.answerIndex;
    this.answerLockedUntil = this.time.now + FEEDBACK_LOCK_MS;
    const correctBtn = this.optionButtons[q.answerIndex];
    const pickedBtn = this.optionButtons[index];

    if (correct) {
      this.streak += 1;
      let pts = CORRECT_POINTS;
      const streakBonus = Math.min(this.streak, STREAK_BONUS_CAP);
      if (streakBonus > 1) pts += streakBonus - 1;
      if (elapsed <= SPEED_BONUS_THRESHOLD_MS) pts += SPEED_BONUS_POINTS;
      this.addScore(pts);
      this.styleOption(pickedBtn, 'correct');
      this.showFeedback(`CORRECT  +${pts}${this.streak > 1 ? `  x${this.streak}` : ''}`, '#66ff88');
    } else {
      this.streak = 0;
      this.addScore(-WRONG_PENALTY);
      this.styleOption(pickedBtn, 'wrong');
      this.styleOption(correctBtn, 'correct');
      this.showFeedback(`WRONG  -${WRONG_PENALTY}`, '#ff3344');
    }

    // Fade out non-relevant options for clarity
    for (const btn of this.optionButtons) {
      if (btn.index !== q.answerIndex && btn.index !== index) {
        btn.container.setAlpha(0.4);
      }
    }

    this.time.delayedCall(FEEDBACK_LOCK_MS, () => {
      if (this.phase !== 'playing') return;
      this.showNextQuestion();
    });
  }

  private showFeedback(text: string, color: string) {
    if (!this.feedbackText) return;
    this.feedbackText.setText(text);
    this.feedbackText.setColor(color);
    this.feedbackText.setAlpha(1);
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      duration: FEEDBACK_LOCK_MS,
      delay: 200,
    });
  }
}
