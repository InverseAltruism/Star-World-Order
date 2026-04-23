import Phaser from 'phaser';

export type Direction = 'down' | 'left' | 'right' | 'up';

const TILE_SIZE = 16;
const PLAYER_SPEED = 120;

export class PlayerSprite extends Phaser.Physics.Arcade.Sprite {
  private direction: Direction = 'down';
  private isPathMoving = false;
  private pathQueue: { x: number; y: number }[] = [];
  private pathTarget: { x: number; y: number } | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: Record<string, Phaser.Input.Keyboard.Key> | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player-down-0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(10);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 10);
    body.setOffset(3, 4);

    this.setupAnimations();
    this.setupInput();
  }

  static generatePlaceholderTextures(scene: Phaser.Scene) {
    const directions: Direction[] = ['down', 'left', 'right', 'up'];

    for (const dir of directions) {
      for (let frame = 0; frame < 3; frame++) {
        const key = `player-${dir}-${frame}`;
        if (scene.textures.exists(key)) continue;

        const g = scene.make.graphics();
        drawPlayerFrame(g, dir, frame);
        g.generateTexture(key, TILE_SIZE, TILE_SIZE);
        g.destroy();
      }
    }
  }

  private setupAnimations() {
    const directions: Direction[] = ['down', 'left', 'right', 'up'];

    for (const dir of directions) {
      const walkKey = `player-walk-${dir}`;
      if (!this.scene.anims.exists(walkKey)) {
        this.scene.anims.create({
          key: walkKey,
          frames: [
            { key: `player-${dir}-1` },
            { key: `player-${dir}-0` },
            { key: `player-${dir}-2` },
            { key: `player-${dir}-0` },
          ],
          frameRate: 8,
          repeat: -1,
        });
      }
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

      if (left) {
        body.setVelocityX(-PLAYER_SPEED);
        this.direction = 'left';
      } else if (right) {
        body.setVelocityX(PLAYER_SPEED);
        this.direction = 'right';
      }

      if (up) {
        body.setVelocityY(-PLAYER_SPEED);
        this.direction = 'up';
      } else if (down) {
        body.setVelocityY(PLAYER_SPEED);
        this.direction = 'down';
      }

      if (body.velocity.x !== 0 && body.velocity.y !== 0) {
        body.velocity.normalize().scale(PLAYER_SPEED);
      }

      this.play(`player-walk-${this.direction}`, true);
      return true;
    }

    if (!this.isPathMoving) {
      body.setVelocity(0);
      this.stop();
      this.setTexture(`player-${this.direction}-0`);
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
      this.setTexture(`player-${this.direction}-0`);
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

function drawPlayerFrame(g: Phaser.GameObjects.Graphics, dir: Direction, frame: number) {
  // Head (cyan)
  g.fillStyle(0x00f7ff, 1);
  g.fillRect(5, 1, 6, 5);

  // Body (darker cyan)
  g.fillStyle(0x00d4dd, 1);
  g.fillRect(4, 6, 8, 5);

  // Direction-specific eyes
  g.fillStyle(0xffffff, 1);
  switch (dir) {
    case 'down':
      g.fillRect(6, 3, 1, 1);
      g.fillRect(9, 3, 1, 1);
      break;
    case 'up':
      g.fillStyle(0x009999, 1);
      g.fillRect(6, 2, 4, 2);
      break;
    case 'left':
      g.fillRect(5, 3, 1, 1);
      g.fillRect(8, 3, 1, 1);
      break;
    case 'right':
      g.fillRect(7, 3, 1, 1);
      g.fillRect(10, 3, 1, 1);
      break;
  }

  // Legs (alternate per frame for walk cycle)
  g.fillStyle(0x0088aa, 1);
  switch (frame) {
    case 0:
      g.fillRect(5, 11, 2, 4);
      g.fillRect(9, 11, 2, 4);
      break;
    case 1:
      g.fillRect(4, 11, 2, 4);
      g.fillRect(10, 11, 2, 3);
      break;
    case 2:
      g.fillRect(4, 11, 2, 3);
      g.fillRect(10, 11, 2, 4);
      break;
  }
}
