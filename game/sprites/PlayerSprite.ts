import Phaser from 'phaser';
import { js as EasyStarPathfinder } from 'easystarjs';

const TILE_SIZE = 16;
const MOVE_SPEED = 120;

type Direction = 'down' | 'up' | 'left' | 'right';

const DIRECTIONS: Direction[] = ['down', 'up', 'left', 'right'];

export class PlayerSprite extends Phaser.GameObjects.Sprite {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasdKeys: Record<string, Phaser.Input.Keyboard.Key> | null = null;
  private pathfinder: EasyStarPathfinder;
  private currentPath: { x: number; y: number }[] = [];
  private pathIndex = 0;
  private direction: Direction = 'down';
  private moving = false;

  constructor(scene: Phaser.Scene, x: number, y: number, pathfinder: EasyStarPathfinder) {
    super(scene, x, y, 'player-down-0');
    this.pathfinder = pathfinder;

    scene.add.existing(this);
    this.setDepth(10);

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasdKeys = {
        W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
  }

  static generateTextures(scene: Phaser.Scene): void {
    const g = scene.make.graphics({ x: 0, y: 0 });

    for (const dir of DIRECTIONS) {
      for (let frame = 0; frame < 2; frame++) {
        g.clear();

        // Body
        g.fillStyle(0x00f7ff);
        g.fillRect(3, 2, 10, 8);

        // Head highlight
        g.fillStyle(0x66ffff);
        g.fillRect(5, 3, 6, 4);

        // Direction indicator (gold arrow)
        g.fillStyle(0xffd700);
        if (dir === 'down') g.fillRect(6, 10, 4, 3);
        else if (dir === 'up') g.fillRect(6, 0, 4, 3);
        else if (dir === 'left') g.fillRect(1, 5, 3, 4);
        else g.fillRect(12, 5, 3, 4);

        // Feet (toggle for walk animation)
        g.fillStyle(0x9966ff);
        if (frame === 0) {
          g.fillRect(4, 12, 3, 3);
          g.fillRect(9, 12, 3, 3);
        } else {
          g.fillRect(3, 12, 3, 3);
          g.fillRect(10, 12, 3, 3);
        }

        g.generateTexture(`player-${dir}-${frame}`, TILE_SIZE, TILE_SIZE);
      }
    }

    g.destroy();

    for (const dir of DIRECTIONS) {
      scene.anims.create({
        key: `walk-${dir}`,
        frames: [
          { key: `player-${dir}-0` },
          { key: `player-${dir}-1` },
        ],
        frameRate: 6,
        repeat: -1,
      });
    }
  }

  moveTo(worldX: number, worldY: number, grid: number[][]): void {
    const gridCols = grid[0]?.length ?? 0;
    const gridRows = grid.length;

    const startCol = Phaser.Math.Clamp(Math.floor(this.x / TILE_SIZE), 0, gridCols - 1);
    const startRow = Phaser.Math.Clamp(Math.floor(this.y / TILE_SIZE), 0, gridRows - 1);
    const endCol = Phaser.Math.Clamp(Math.floor(worldX / TILE_SIZE), 0, gridCols - 1);
    const endRow = Phaser.Math.Clamp(Math.floor(worldY / TILE_SIZE), 0, gridRows - 1);

    if (startCol === endCol && startRow === endRow) return;

    this.pathfinder.findPath(startCol, startRow, endCol, endRow, (path) => {
      if (path && path.length > 1) {
        this.currentPath = path.slice(1).map(p => ({
          x: p.x * TILE_SIZE + TILE_SIZE / 2,
          y: p.y * TILE_SIZE + TILE_SIZE / 2,
        }));
        this.pathIndex = 0;
      }
    });
    this.pathfinder.calculate();
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    let dx = 0;
    let dy = 0;

    const left = this.cursors?.left.isDown || this.wasdKeys?.A.isDown;
    const right = this.cursors?.right.isDown || this.wasdKeys?.D.isDown;
    const up = this.cursors?.up.isDown || this.wasdKeys?.W.isDown;
    const down = this.cursors?.down.isDown || this.wasdKeys?.S.isDown;

    if (left || right || up || down) {
      this.currentPath = [];
      this.pathIndex = 0;

      if (left) dx -= 1;
      if (right) dx += 1;
      if (up) dy -= 1;
      if (down) dy += 1;
    } else if (this.pathIndex < this.currentPath.length) {
      const target = this.currentPath[this.pathIndex];
      const distX = target.x - this.x;
      const distY = target.y - this.y;
      const dist = Math.sqrt(distX * distX + distY * distY);

      if (dist < 2) {
        this.pathIndex++;
      } else {
        dx = distX / dist;
        dy = distY / dist;
      }
    }

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = (dx / len) * MOVE_SPEED * dt;
      const ny = (dy / len) * MOVE_SPEED * dt;
      this.x += nx;
      this.y += ny;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.direction = dx > 0 ? 'right' : 'left';
      } else {
        this.direction = dy > 0 ? 'down' : 'up';
      }

      if (!this.moving) {
        this.moving = true;
      }
      this.play(`walk-${this.direction}`, true);
    } else {
      if (this.moving) {
        this.moving = false;
        this.stop();
        this.setTexture(`player-${this.direction}-0`);
      }
    }
  }
}
