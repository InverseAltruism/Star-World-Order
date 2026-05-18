import * as Phaser from 'phaser';

export type Direction = 'down' | 'left' | 'right' | 'up';

const FRAME_W = 48;
const FRAME_H = 48;
const PLAYER_SCALE = 1;
const PLAYER_SPEED = 110;
const SHEET_KEY = 'player-v3-sheet';

// rd_animation__four_angle_walking outputs a 4×4 grid (rows = directions,
// cols = walk-cycle frames). Row 0 = back (up), row 2 = front (down) —
// confirmed by pixel inspection. Rows 1 and 3 are the two side profiles;
// in-game testing confirms the order is CLOCKWISE: up=0, right=1, down=2,
// left=3. (Pixel art profiles are mirror-symmetric and visually ambiguous,
// so the user's keyboard test is the authority.)
const DIRECTION_ROW: Record<Direction, number> = {
  up: 0, right: 1, down: 2, left: 3,
};

interface PathPoint { x: number; y: number }

export class PlayerSpriteV3 extends Phaser.Physics.Arcade.Sprite {
  private direction: Direction = 'down';
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: Record<string, Phaser.Input.Keyboard.Key> | null = null;
  private shadow: Phaser.GameObjects.Ellipse | null = null;
  private pathQueue: PathPoint[] = [];
  private pathTarget: PathPoint | null = null;
  private isPathMoving = false;
  private navCell = 16;
  private bobOffset = 0;

  static preload(scene: Phaser.Scene, sheetUrl: string) {
    if (scene.textures.exists(SHEET_KEY)) return;
    scene.load.spritesheet(SHEET_KEY, sheetUrl, { frameWidth: FRAME_W, frameHeight: FRAME_H });
  }

  static registerAnims(scene: Phaser.Scene) {
    const dirs: Direction[] = ['down', 'left', 'right', 'up'];
    for (const dir of dirs) {
      const key = `player-v3-walk-${dir}`;
      if (scene.anims.exists(key)) continue;
      const base = DIRECTION_ROW[dir] * 4;
      scene.anims.create({
        key,
        frames: [
          { key: SHEET_KEY, frame: base + 0 },
          { key: SHEET_KEY, frame: base + 1 },
          { key: SHEET_KEY, frame: base + 2 },
          { key: SHEET_KEY, frame: base + 3 },
        ],
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, SHEET_KEY, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    this.setScale(PLAYER_SCALE);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Feet hitbox: 24×16 centred at the bottom of the 48×48 frame.
    body.setSize(24, 16);
    body.setOffset(12, 30);

    this.shadow = scene.add.ellipse(x, y + 22, 28, 8, 0x000000, 0.35);
    this.shadow.setDepth(this.depth - 1);

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasd = {
        W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    // Subtle 1.5px sin bob when idle; matches NPCSpriteV3 so the player and
    // surrounding NPCs share the same "breathing" cadence. Remove last frame's
    // bob first so we don't accumulate drift on the physics body.
    this.y -= this.bobOffset;
    this.bobOffset = 0;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const isMoving = body.velocity.x !== 0 || body.velocity.y !== 0;
    if (!isMoving && !this.isPathMoving) {
      this.bobOffset = Math.sin(time * 0.003) * 1.5;
      this.y += this.bobOffset;
    }
    // Shadow always sits at the body's true ground position (not the bobbed one).
    if (this.shadow) this.shadow.setPosition(this.x, this.y - this.bobOffset + 22);
  }

  getDirection(): Direction {
    return this.direction;
  }

  setNavCell(cell: number) {
    this.navCell = Math.max(1, Math.floor(cell));
  }

  isPathActive(): boolean {
    return this.isPathMoving;
  }

  setPath(path: PathPoint[]) {
    // EasyStar emits the start tile as path[0]; skip it so we don't re-walk
    // a fractional cell and stutter at the first step.
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

  private moveToNextPoint() {
    if (this.pathQueue.length === 0) {
      this.isPathMoving = false;
      this.pathTarget = null;
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0);
      this.stop();
      this.setFrame(DIRECTION_ROW[this.direction] * 4);
      return;
    }

    const next = this.pathQueue.shift()!;
    this.pathTarget = {
      x: next.x * this.navCell + this.navCell / 2,
      y: next.y * this.navCell + this.navCell / 2,
    };

    const dx = this.pathTarget.x - this.x;
    const dy = this.pathTarget.y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx > 0 ? 'right' : 'left';
    } else if (dy !== 0) {
      this.direction = dy > 0 ? 'down' : 'up';
    }

    this.play(`player-v3-walk-${this.direction}`, true);
  }

  /**
   * @returns true if the keyboard produced movement this frame. Caller
   * should skip `updatePathMovement()` in that case so click-to-move
   * yields cleanly to keyboard control.
   */
  handleInput(): boolean {
    if (!this.cursors || !this.wasd) return false;
    const body = this.body as Phaser.Physics.Arcade.Body;

    const left  = this.cursors.left.isDown  || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up    = this.cursors.up.isDown    || this.wasd.W.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.S.isDown;

    if (left || right || up || down) {
      this.clearPath();
      body.setVelocity(0);

      if (left)  { body.setVelocityX(-PLAYER_SPEED); this.direction = 'left'; }
      else if (right) { body.setVelocityX(PLAYER_SPEED); this.direction = 'right'; }
      if (up)    { body.setVelocityY(-PLAYER_SPEED); this.direction = 'up'; }
      else if (down)  { body.setVelocityY(PLAYER_SPEED);  this.direction = 'down'; }

      if (body.velocity.x !== 0 && body.velocity.y !== 0) {
        body.velocity.normalize().scale(PLAYER_SPEED);
      }

      this.play(`player-v3-walk-${this.direction}`, true);
      return true;
    }

    if (!this.isPathMoving) {
      body.setVelocity(0);
      this.stop();
      this.setFrame(DIRECTION_ROW[this.direction] * 4);
    }
    return false;
  }

  destroy(fromScene?: boolean) {
    this.shadow?.destroy();
    this.shadow = null;
    super.destroy(fromScene);
  }
}
