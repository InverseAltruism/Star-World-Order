import * as Phaser from 'phaser';

export type Direction = 'down' | 'left' | 'right' | 'up';

const TILE_SIZE = 16;
const PLAYER_SPEED = 120;
const SRC_KEY = 'player-sheet';
const SPRITE_KEY = 'player-sheet-clean';
const FRAME_W = 150;
const FRAME_H = 240;
const PLAYER_SCALE = 0.26;

const DIRECTION_ROW: Record<Direction, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

// Tight character bounding boxes within Male_Grey_Sprite_transparent.png
// (from scripts/analyze_sprite.mjs). Layout is identical across all 4 sheets.
const CHAR_BBOXES: ReadonlyArray<ReadonlyArray<{ x: number; y: number; w: number; h: number }>> = [
  [{ x: 182, y:  51, w: 122, h: 236 }, { x: 441, y:  51, w: 119, h: 236 }, { x: 701, y:  51, w: 116, h: 236 }, { x: 961, y:  51, w: 115, h: 236 }],
  [{ x: 179, y: 338, w: 135, h: 226 }, { x: 436, y: 341, w: 134, h: 222 }, { x: 693, y: 340, w: 128, h: 223 }, { x: 949, y: 342, w: 128, h: 222 }],
  [{ x: 166, y: 630, w: 131, h: 224 }, { x: 424, y: 631, w: 129, h: 222 }, { x: 680, y: 630, w: 129, h: 224 }, { x: 940, y: 630, w: 127, h: 224 }],
  [{ x: 185, y: 914, w: 117, h: 230 }, { x: 442, y: 914, w: 113, h: 230 }, { x: 699, y: 914, w: 112, h: 230 }, { x: 955, y: 914, w: 113, h: 230 }],
];

function idleFrame(dir: Direction): number {
  return DIRECTION_ROW[dir] * 4;
}

export class PlayerSprite extends Phaser.Physics.Arcade.Sprite {
  private direction: Direction = 'down';
  private isPathMoving = false;
  private pathQueue: { x: number; y: number }[] = [];
  private pathTarget: { x: number; y: number } | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: Record<string, Phaser.Input.Keyboard.Key> | null = null;
  private shadow: Phaser.GameObjects.Ellipse | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, SPRITE_KEY, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    this.setScale(PLAYER_SCALE);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Tight hitbox around the character's feet inside the 150×240 clean frame.
    body.setSize(80, 50);
    body.setOffset(35, 190);

    // Ground shadow under the feet, kept in sync via preUpdate. Helps the
    // character sit on the painted overworld instead of floating in front.
    this.shadow = scene.add.ellipse(
      x,
      y + this.displayHeight * 0.46,
      this.displayWidth * 0.55,
      Math.max(4, this.displayHeight * 0.13),
      0x000000,
      0.35,
    );
    this.shadow.setDepth(this.depth - 1);

    this.setupAnimations();
    this.setupInput();
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (this.shadow) {
      this.shadow.setPosition(this.x, this.y + this.displayHeight * 0.46);
    }
  }

  destroy(fromScene?: boolean) {
    this.shadow?.destroy();
    this.shadow = null;
    super.destroy(fromScene);
  }

  static generatePlaceholderTextures(_scene: Phaser.Scene) {
    // No-op: real sprites now come from the spritesheet loaded in BootScene.
  }

  static registerFrames(scene: Phaser.Scene) {
    // The artist drew each of the 16 walk frames at a different horizontal
    // offset inside its cell — up to ~170 px of drift across a row, which
    // made the character visibly slide left/right each step.
    // Fix: extract each character's tight bounding box from the source
    // sheet and re-paste it centered inside a uniform FRAME_W × FRAME_H
    // canvas cell. Then register those cells as numbered frames 0-15.
    if (scene.textures.exists(SPRITE_KEY)) return;
    const src = scene.textures.get(SRC_KEY);
    if (!src || src.key === '__MISSING') return;
    const srcImg = src.getSourceImage() as CanvasImageSource;

    const canvas = scene.textures.createCanvas(SPRITE_KEY, FRAME_W * 4, FRAME_H * 4);
    if (!canvas) return;
    const ctx = canvas.getContext();
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const b = CHAR_BBOXES[row][col];
        // Horizontally center the character; bottom-align vertically so
        // the feet are at a consistent y across every frame.
        const dx = col * FRAME_W + Math.floor((FRAME_W - b.w) / 2);
        const dy = row * FRAME_H + (FRAME_H - b.h);
        ctx.drawImage(srcImg, b.x, b.y, b.w, b.h, dx, dy, b.w, b.h);
      }
    }
    canvas.refresh();

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const name = String(row * 4 + col);
        if (canvas.has(name)) continue;
        canvas.add(name, 0, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H);
      }
    }
  }

  private setupAnimations() {
    const dirs: Direction[] = ['down', 'right', 'left', 'up'];
    for (const dir of dirs) {
      const key = `player-walk-${dir}`;
      if (this.scene.anims.exists(key)) continue;
      const base = DIRECTION_ROW[dir] * 4;
      this.scene.anims.create({
        key,
        frames: [
          { key: SPRITE_KEY, frame: base + 0 },
          { key: SPRITE_KEY, frame: base + 1 },
        ],
        frameRate: 4,
        repeat: -1,
      });
    }
  }

  private setupInput() {
    if (!this.scene.input.keyboard) return;
    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.wasd = {
      W: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  handleKeyboardInput(): boolean {
    if (!this.cursors || !this.wasd) return false;
    const body = this.body as Phaser.Physics.Arcade.Body;

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    if (left || right || up || down) {
      this.clearPath();
      body.setVelocity(0);

      if (left) { body.setVelocityX(-PLAYER_SPEED); this.direction = 'left'; }
      else if (right) { body.setVelocityX(PLAYER_SPEED); this.direction = 'right'; }

      if (up) { body.setVelocityY(-PLAYER_SPEED); this.direction = 'up'; }
      else if (down) { body.setVelocityY(PLAYER_SPEED); this.direction = 'down'; }

      if (body.velocity.x !== 0 && body.velocity.y !== 0) {
        body.velocity.normalize().scale(PLAYER_SPEED);
      }

      this.play(`player-walk-${this.direction}`, true);
      return true;
    }

    if (!this.isPathMoving) {
      body.setVelocity(0);
      this.stop();
      this.setFrame(idleFrame(this.direction));
    }

    return false;
  }

  setPath(path: { x: number; y: number }[]) {
    this.pathQueue = path.slice(1);
    this.isPathMoving = true;
    this.moveToNextPoint();
  }

  clearPath() {
    this.pathQueue = [];
    this.pathTarget = null;
    this.isPathMoving = false;
  }

  updatePathMovement() {
    if (!this.isPathMoving || !this.pathTarget) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const dx = this.pathTarget.x - this.x;
    const dy = this.pathTarget.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) {
      this.setPosition(this.pathTarget.x, this.pathTarget.y);
      body.setVelocity(0);
      this.moveToNextPoint();
      return;
    }

    const vx = (dx / dist) * PLAYER_SPEED;
    const vy = (dy / dist) * PLAYER_SPEED;
    body.setVelocity(vx, vy);
  }

  getDirection(): Direction {
    return this.direction;
  }

  getTilePos(): { x: number; y: number } {
    return {
      x: Math.floor(this.x / TILE_SIZE),
      y: Math.floor(this.y / TILE_SIZE),
    };
  }

  private moveToNextPoint() {
    if (this.pathQueue.length === 0) {
      this.isPathMoving = false;
      this.pathTarget = null;
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0);
      this.stop();
      this.setFrame(idleFrame(this.direction));
      return;
    }

    const next = this.pathQueue.shift()!;
    this.pathTarget = {
      x: next.x * TILE_SIZE + TILE_SIZE / 2,
      y: next.y * TILE_SIZE + TILE_SIZE / 2,
    };

    const dx = this.pathTarget.x - this.x;
    const dy = this.pathTarget.y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx > 0 ? 'right' : 'left';
    } else if (dy !== 0) {
      this.direction = dy > 0 ? 'down' : 'up';
    }

    this.play(`player-walk-${this.direction}`, true);
  }
}
