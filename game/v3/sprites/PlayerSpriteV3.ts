import Phaser from 'phaser';

export type Direction = 'down' | 'left' | 'right' | 'up';

const FRAME_W = 48;
const FRAME_H = 48;
const PLAYER_SCALE = 1;
const PLAYER_SPEED = 110;
const SHEET_KEY = 'player-v3-sheet';

// rd_animation__four_angle_walking outputs a 4×4 grid (rows = directions,
// cols = walk-cycle frames). Empirical row order from the model: down=0,
// left=1, right=2, up=3 (matches V2 convention; we flip if a future sheet
// reads as down/up/left/right instead).
const DIRECTION_ROW: Record<Direction, number> = {
  down: 0, left: 1, right: 2, up: 3,
};

export class PlayerSpriteV3 extends Phaser.Physics.Arcade.Sprite {
  private direction: Direction = 'down';
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: Record<string, Phaser.Input.Keyboard.Key> | null = null;
  private shadow: Phaser.GameObjects.Ellipse | null = null;

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
    if (this.shadow) this.shadow.setPosition(this.x, this.y + 22);
  }

  handleInput() {
    if (!this.cursors || !this.wasd) return;
    const body = this.body as Phaser.Physics.Arcade.Body;

    const left  = this.cursors.left.isDown  || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up    = this.cursors.up.isDown    || this.wasd.W.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.S.isDown;

    body.setVelocity(0);

    if (left || right || up || down) {
      if (left)  { body.setVelocityX(-PLAYER_SPEED); this.direction = 'left'; }
      else if (right) { body.setVelocityX(PLAYER_SPEED); this.direction = 'right'; }
      if (up)    { body.setVelocityY(-PLAYER_SPEED); this.direction = 'up'; }
      else if (down)  { body.setVelocityY(PLAYER_SPEED);  this.direction = 'down'; }

      if (body.velocity.x !== 0 && body.velocity.y !== 0) {
        body.velocity.normalize().scale(PLAYER_SPEED);
      }

      this.play(`player-v3-walk-${this.direction}`, true);
    } else {
      this.stop();
      this.setFrame(DIRECTION_ROW[this.direction] * 4);
    }
  }

  destroy(fromScene?: boolean) {
    this.shadow?.destroy();
    this.shadow = null;
    super.destroy(fromScene);
  }
}
