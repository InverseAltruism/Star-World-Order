import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';

const PLAYER_SPEED = 120;
const CAMERA_ZOOM = 2;
const TILE_SIZE = 16;

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  private zoneLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    const map = this.make.tilemap({ key: 'world-map' });
    const tileset = map.addTilesetImage('sanctuary', 'tileset');

    if (!tileset) {
      console.error('Failed to load tileset');
      return;
    }

    const groundLayer = map.createLayer('Ground', tileset, 0, 0);
    const detailLayer = map.createLayer('Detail', tileset, 0, 0);
    this.collisionLayer = map.createLayer('Collision', tileset, 0, 0)!;

    this.collisionLayer.setCollisionByExclusion([-1, 0]);

    let spawnX = 20 * TILE_SIZE + TILE_SIZE / 2;
    let spawnY = 15 * TILE_SIZE + TILE_SIZE / 2;

    const objectLayer = map.getObjectLayer('Objects');
    if (objectLayer) {
      for (const obj of objectLayer.objects) {
        if (obj.type === 'spawn' && obj.x != null && obj.y != null) {
          spawnX = obj.x + TILE_SIZE / 2;
          spawnY = obj.y + TILE_SIZE / 2;
        }
      }
    }

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);

    this.physics.add.collider(this.player, this.collisionLayer);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(CAMERA_ZOOM);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    this.addZoneLabels(objectLayer);

    EventBus.emit('scene-ready', this);
  }

  private addZoneLabels(objectLayer: Phaser.Tilemaps.ObjectLayer | null) {
    if (!objectLayer) return;

    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '4px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 1,
    };

    for (const obj of objectLayer.objects) {
      if (obj.type === 'zone' && obj.name && obj.x != null && obj.y != null) {
        const label = this.add.text(
          obj.x + TILE_SIZE / 2,
          obj.y - 6,
          obj.name.toUpperCase(),
          labelStyle
        );
        label.setOrigin(0.5, 1);
        label.setDepth(20);
        this.zoneLabels.push(label);
      }
    }
  }

  update() {
    if (!this.cursors || !this.player) return;

    const body = this.player.body;
    body.setVelocity(0);

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    if (left) {
      body.setVelocityX(-PLAYER_SPEED);
    } else if (right) {
      body.setVelocityX(PLAYER_SPEED);
    }

    if (up) {
      body.setVelocityY(-PLAYER_SPEED);
    } else if (down) {
      body.setVelocityY(PLAYER_SPEED);
    }

    if (body.velocity.x !== 0 && body.velocity.y !== 0) {
      body.velocity.normalize().scale(PLAYER_SPEED);
    }
  }
}
