import Phaser from 'phaser';
import * as EasyStar from 'easystarjs';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSprite } from '../sprites/PlayerSprite';
import { CompanionSprite } from '../sprites/CompanionSprite';
import { AnimationSystem, type CompanionMood, type Constellation, CONSTELLATIONS } from '../systems/AnimationSystem';
import { ZoneSystem } from '../systems/ZoneSystem';
import { OtherPlayersManager } from '../sprites/OtherPlayerSprite';
import type { RemotePlayer } from '@/lib/colyseus/types';

const CAMERA_ZOOM = 2;
const TILE_SIZE = 16;

export class WorldScene extends Phaser.Scene {
  private player!: PlayerSprite;
  private companion!: CompanionSprite;
  private animSystem!: AnimationSystem;
  private finder!: EasyStar.js;
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  private zoneLabels: Phaser.GameObjects.Text[] = [];
  private clickMarker: Phaser.GameObjects.Graphics | null = null;
  private zoneSystem!: ZoneSystem;
  private otherPlayers!: OtherPlayersManager;

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

    map.createLayer('Ground', tileset, 0, 0);
    map.createLayer('Detail', tileset, 0, 0);
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

    this.animSystem = new AnimationSystem(this);

    this.player = new PlayerSprite(this, spawnX, spawnY);
    this.companion = new CompanionSprite(this, spawnX + 20, spawnY + 10);
    this.companion.setAnimationSystem(this.animSystem);

    this.physics.add.collider(this.player, this.collisionLayer);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(CAMERA_ZOOM);

    this.setupPathfinding(map);
    this.setupClickToMove();
    this.addZoneLabels(objectLayer);
    this.setupEventBridge();

    this.zoneSystem = new ZoneSystem(map.widthInPixels, map.heightInPixels);
    this.drawZoneOverlays();
    this.setupCompanionClick();
    this.setupOtherPlayers();

    EventBus.emit('scene-ready', this);
  }

  private setupEventBridge() {
    EventBus.on('companion-mood', (mood: string) => {
      const validMoods: CompanionMood[] = ['happy', 'calm', 'sleepy', 'excited', 'curious', 'idle'];
      if (validMoods.includes(mood as CompanionMood)) {
        this.companion.setMood(mood as CompanionMood);
      }
    });

    EventBus.on('companion-constellation', (constellation: string) => {
      const lower = constellation.toLowerCase() as Constellation;
      if ((CONSTELLATIONS as readonly string[]).includes(lower)) {
        this.companion.setConstellation(lower);
      }
    });
  }

  private setupPathfinding(map: Phaser.Tilemaps.Tilemap) {
    this.finder = new EasyStar.js();

    const grid: number[][] = [];
    for (let y = 0; y < map.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < map.width; x++) {
        const tile = this.collisionLayer.getTileAt(x, y);
        row.push(tile && tile.index > 0 ? 1 : 0);
      }
      grid.push(row);
    }

    this.finder.setGrid(grid);
    this.finder.setAcceptableTiles([0]);
    this.finder.enableDiagonals();
    this.finder.setIterationsPerCalculation(100);
  }

  private setupClickToMove() {
    this.clickMarker = this.add.graphics();
    this.clickMarker.setDepth(5);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;

      const tileX = Math.floor(pointer.worldX / TILE_SIZE);
      const tileY = Math.floor(pointer.worldY / TILE_SIZE);

      const collisionTile = this.collisionLayer.getTileAt(tileX, tileY);
      if (collisionTile && collisionTile.index > 0) return;

      this.showClickMarker(pointer.worldX, pointer.worldY);

      const playerTile = this.player.getTilePos();
      this.finder.findPath(
        playerTile.x,
        playerTile.y,
        tileX,
        tileY,
        (path) => {
          if (path && path.length > 1) {
            this.player.setPath(path);
          }
        }
      );
      this.finder.calculate();
    });
  }

  private showClickMarker(x: number, y: number) {
    if (!this.clickMarker) return;
    this.clickMarker.clear();
    this.clickMarker.lineStyle(1, 0xffd700, 0.8);
    this.clickMarker.strokeCircle(x, y, 4);

    this.tweens.add({
      targets: this.clickMarker,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        this.clickMarker?.setAlpha(1);
        this.clickMarker?.clear();
      },
    });
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

  private drawZoneOverlays(): void {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x9966ff, 0.25);

    for (const zone of this.zoneSystem.getZones()) {
      gfx.strokeRect(zone.x, zone.y, zone.width, zone.height);
    }
  }

  private setupCompanionClick() {
    this.companion.setInteractive({ useHandCursor: true });
    this.companion.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const camera = this.cameras.main;
      const canvas = this.game.canvas;
      const screenX = (this.companion.x - camera.worldView.x) * camera.zoom + canvas.offsetLeft;
      const screenY = (this.companion.y - camera.worldView.y) * camera.zoom + canvas.offsetTop;
      EventBus.emit('companion-clicked', { screenX, screenY });
      pointer.event.stopPropagation();
    });
  }

  private setupOtherPlayers() {
    this.otherPlayers = new OtherPlayersManager(this);

    EventBus.on('remote-player-add', (player: RemotePlayer) => {
      this.otherPlayers.addPlayer(player);
    });

    EventBus.on('remote-player-remove', (sessionId: string) => {
      this.otherPlayers.removePlayer(sessionId);
    });

    EventBus.on('remote-player-update', (player: RemotePlayer) => {
      this.otherPlayers.updatePlayer(player);
    });
  }

  update() {
    if (!this.player) return;

    const keyboardActive = this.player.handleKeyboardInput();

    if (!keyboardActive) {
      this.player.updatePathMovement();
    }

    this.companion.followPlayer(this.player.x, this.player.y, this.player.getDirection());
    this.zoneSystem.update(this.player.x, this.player.y);
    this.otherPlayers.update(this.cameras.main);
  }

  shutdown() {
    this.zoneSystem.destroy();
    this.otherPlayers.destroy();
    EventBus.off('companion-mood');
    EventBus.off('companion-constellation');
    EventBus.off('remote-player-add');
    EventBus.off('remote-player-remove');
    EventBus.off('remote-player-update');
  }
}
