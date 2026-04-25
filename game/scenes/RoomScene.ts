import Phaser from 'phaser';
import * as EasyStar from 'easystarjs';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSprite } from '../sprites/PlayerSprite';
import { CompanionSprite } from '../sprites/CompanionSprite';
import { NPCManager } from '../sprites/NPCSprite';
import { AnimationSystem } from '../systems/AnimationSystem';
import { NAV_CELL, type RoomKey } from '../config/worldLayout';
import { getRoomLayout } from '../config/roomLayouts';
import { getRoomNPCDefinitions } from '../config/npcDefinitions';

const ROOM_W = 1448;
const ROOM_H = 1086;
const SOUTHERN_SPAWN_Y = ROOM_H - 110;
const EXIT_ZONE_W = 120;
const EXIT_ZONE_H = 30;
// Ignore exit triggers (E, ESC, exit-zone overlap) for this many ms after entry,
// so the same E press that opened the room can't immediately close it.
const EXIT_GRACE_MS = 700;

export class RoomScene extends Phaser.Scene {
  private room!: RoomKey;
  private returnTo!: { x: number; y: number };
  private player!: PlayerSprite;
  private companion!: CompanionSprite;
  private animSystem!: AnimationSystem;
  private finder!: EasyStar.js;
  private navGrid: number[][] = [];
  private gridW = 0;
  private gridH = 0;
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;
  private clickMarker: Phaser.GameObjects.Graphics | null = null;
  private exiting = false;
  private exitArmedAt = 0;
  private npcManager: NPCManager | null = null;

  constructor() {
    super({ key: 'RoomScene' });
  }

  create(data: { room: RoomKey; returnTo: { x: number; y: number } }) {
    this.room = data.room;
    this.returnTo = data.returnTo;
    this.exiting = false;
    this.exitArmedAt = this.time.now + EXIT_GRACE_MS;

    const bgKey = `room-bg-${this.room}`;
    const bg = this.textures.exists(bgKey)
      ? this.add.image(0, 0, bgKey)
      : this.add.image(0, 0, 'room-placeholder');
    bg.setOrigin(0, 0).setDisplaySize(ROOM_W, ROOM_H).setDepth(-10);

    this.physics.world.setBounds(0, 0, ROOM_W, ROOM_H);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, ROOM_W, ROOM_H);
    cam.setZoom(1);
    cam.setBackgroundColor('#0a0015');
    cam.fadeIn(250, 0, 0, 0);

    this.buildNavGrid();
    this.createCollisionBodies();

    const spawnX = ROOM_W / 2;
    const spawnY = SOUTHERN_SPAWN_Y;

    this.animSystem = new AnimationSystem(this);
    this.player = new PlayerSprite(this, spawnX, spawnY);
    this.companion = new CompanionSprite(this, spawnX + 20, spawnY + 10);
    this.companion.setAnimationSystem(this.animSystem);

    this.physics.add.collider(this.player, this.collisionGroup);
    cam.startFollow(this.player, true, 0.1, 0.1);

    this.setupPathfinder();
    this.setupClickToMove();
    this.setupExitZone();
    this.setupHUD();
    this.setupNPCs();

    this.input.keyboard!.on('keydown-ESC', () => this.exit());
    this.input.keyboard!.on('keydown-E', () => this.exit());
    this.input.keyboard!.on('keydown-J', () => {
      EventBus.emit('journal-overlay-toggle');
    });
    this.input.keyboard!.on('keydown-T', () => {
      EventBus.emit('traits-overlay-toggle');
    });

    EventBus.on('minigame-launch', this.handleMinigameLaunch, this);
    EventBus.on('minigame-exit', this.handleMinigameExit, this);
  }

  private handleMinigameLaunch(payload: {
    gameId: string;
    sceneKey: string;
    tokenId: number | null;
    durationSeconds?: number;
    title?: string;
  }) {
    if (this.exiting) return;
    if (!this.scene.manager.keys[payload.sceneKey]) return;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      const returnTo = { x: this.player.x, y: this.player.y };
      this.scene.sleep();
      this.scene.launch(payload.sceneKey, {
        gameId: payload.gameId,
        tokenId: payload.tokenId,
        returnRoom: this.room,
        returnTo,
        durationSeconds: payload.durationSeconds,
        title: payload.title,
      });
    });
  }

  private handleMinigameExit(payload: {
    sceneKey?: string;
    returnRoom?: string;
    returnTo?: { x: number; y: number };
  }) {
    if (!payload?.returnRoom || payload.returnRoom !== this.room) return;
    if (!this.scene.isSleeping()) return;
    // Stop the specific minigame scene the user just exited. Falling back to
    // a sweep keeps us safe if a future scene forgets to send sceneKey.
    if (payload.sceneKey && this.scene.manager.getScene(payload.sceneKey)) {
      this.scene.stop(payload.sceneKey);
    } else {
      const keys = [
        'StarCatchScene',
        'MemoryMatchScene',
        'StarConnectScene',
        'ForgeHammerScene',
        'LoreTriviaScene',
        'CookingRhythmScene',
        'DreamCatcherScene',
      ];
      for (const k of keys) {
        if (this.scene.manager.getScene(k)?.scene.isActive()) {
          this.scene.stop(k);
        }
      }
    }
    this.scene.wake();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    if (payload.returnTo && this.player) {
      this.player.setPosition(payload.returnTo.x, payload.returnTo.y);
      this.companion.setPosition(payload.returnTo.x + 20, payload.returnTo.y + 10);
    }
  }

  private buildNavGrid() {
    this.gridW = Math.ceil(ROOM_W / NAV_CELL);
    this.gridH = Math.ceil(ROOM_H / NAV_CELL);
    this.navGrid = Array.from({ length: this.gridH }, () =>
      Array.from({ length: this.gridW }, () => 0),
    );
    for (const rect of getRoomLayout(this.room).collision) {
      const x0 = Math.max(0, Math.floor(rect.x / NAV_CELL));
      const y0 = Math.max(0, Math.floor(rect.y / NAV_CELL));
      const x1 = Math.min(this.gridW - 1, Math.floor((rect.x + rect.w - 1) / NAV_CELL));
      const y1 = Math.min(this.gridH - 1, Math.floor((rect.y + rect.h - 1) / NAV_CELL));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) this.navGrid[y][x] = 1;
      }
    }
  }

  private createCollisionBodies() {
    this.collisionGroup = this.physics.add.staticGroup();
    for (const rect of getRoomLayout(this.room).collision) {
      const zone = this.add.zone(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h);
      this.collisionGroup.add(zone);
    }
  }

  private setupPathfinder() {
    this.finder = new EasyStar.js();
    this.finder.setGrid(this.navGrid);
    this.finder.setAcceptableTiles([0]);
    this.finder.enableDiagonals();
    this.finder.setIterationsPerCalculation(200);
  }

  private setupClickToMove() {
    this.clickMarker = this.add.graphics().setDepth(5);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const gx = Math.floor(worldX / NAV_CELL);
      const gy = Math.floor(worldY / NAV_CELL);
      if (gx < 0 || gy < 0 || gx >= this.gridW || gy >= this.gridH) return;
      if (this.navGrid[gy][gx] === 1) return;

      this.showClickMarker(worldX, worldY);

      const pgx = Math.floor(this.player.x / NAV_CELL);
      const pgy = Math.floor(this.player.y / NAV_CELL);
      this.finder.findPath(pgx, pgy, gx, gy, (path) => {
        if (path && path.length > 1) this.player.setPath(path);
      });
      this.finder.calculate();
    });
  }

  private showClickMarker(x: number, y: number) {
    if (!this.clickMarker) return;
    this.clickMarker.clear();
    this.clickMarker.lineStyle(1, 0xffd700, 0.9);
    this.clickMarker.strokeCircle(x, y, 5);
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

  private setupExitZone() {
    const zoneCenterX = ROOM_W / 2;
    const zoneCenterY = ROOM_H - EXIT_ZONE_H / 2;
    const zone = this.add.zone(zoneCenterX, zoneCenterY, EXIT_ZONE_W, EXIT_ZONE_H);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => this.exit());

    const hint = this.add
      .text(zoneCenterX, zoneCenterY - 28, '[E] EXIT', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#ff00ff',
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: 'rgba(26,0,51,0.75)',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(20);
    void hint;
  }

  private setupNPCs() {
    const defs = getRoomNPCDefinitions(this.room);
    if (defs.length === 0) return;
    this.npcManager = new NPCManager(this, defs);
  }

  private setupHUD() {
    const screenW = this.scale.width;
    this.add
      .text(screenW / 2, 16, this.room.toUpperCase(), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: 'rgba(10,0,21,0.75)',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  update() {
    if (!this.player || this.exiting) return;
    const keyboardActive = this.player.handleKeyboardInput();
    if (!keyboardActive) this.player.updatePathMovement();
    this.companion.followPlayer(this.player.x, this.player.y, this.player.getDirection());
    this.npcManager?.update(this.time.now);
  }

  private exit() {
    if (this.exiting) return;
    if (this.time.now < this.exitArmedAt) return;
    this.exiting = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      EventBus.emit('room-exit', { returnTo: this.returnTo });
    });
  }

  shutdown() {
    this.npcManager?.destroy();
    this.npcManager = null;
    EventBus.off('minigame-launch', this.handleMinigameLaunch, this);
    EventBus.off('minigame-exit', this.handleMinigameExit, this);
  }
}
