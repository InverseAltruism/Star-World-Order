import Phaser from 'phaser';
import { js as EasyStarPathfinder } from 'easystarjs';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSprite } from '../sprites/PlayerSprite';
import { CompanionSprite } from '../sprites/CompanionSprite';

const TILE_SIZE = 16;
const WORLD_WIDTH = 1440;
const WORLD_HEIGHT = 810;
const GRID_COLS = Math.floor(WORLD_WIDTH / TILE_SIZE);
const GRID_ROWS = Math.floor(WORLD_HEIGHT / TILE_SIZE);

export class WorldScene extends Phaser.Scene {
  private player!: PlayerSprite;
  private companion!: CompanionSprite;
  private walkGrid!: number[][];

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    const bg = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'map_bg');
    bg.setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    bg.setDepth(0);

    this.walkGrid = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: number[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        row.push(0);
      }
      this.walkGrid.push(row);
    }

    const pathfinder = new EasyStarPathfinder();
    pathfinder.setGrid(this.walkGrid);
    pathfinder.setAcceptableTiles([0]);
    pathfinder.enableDiagonals();
    pathfinder.setIterationsPerCalculation(1000);

    this.player = new PlayerSprite(
      this,
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      pathfinder,
    );

    this.companion = new CompanionSprite(
      this,
      WORLD_WIDTH / 2 + -24,
      WORLD_HEIGHT / 2 + 12,
    );

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.player.moveTo(pointer.worldX, pointer.worldY, this.walkGrid);
    });

    EventBus.emit('scene-ready', this);
  }

  update(time: number, delta: number) {
    this.player.update(time, delta);
    this.companion.followPlayer(this.player.x, this.player.y);
    this.companion.update();
  }
}
