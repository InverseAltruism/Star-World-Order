import Phaser from 'phaser';
import * as EasyStar from 'easystarjs';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSprite } from '../sprites/PlayerSprite';
import { CompanionSprite } from '../sprites/CompanionSprite';
import { OtherPlayersManager } from '../sprites/OtherPlayerSprite';
import { NPCManager } from '../sprites/NPCSprite';
import { AnimationSystem, type CompanionMood, type Constellation, CONSTELLATIONS } from '../systems/AnimationSystem';
import type { RemotePlayer } from '@/lib/colyseus/types';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  NAV_CELL,
  SPAWN,
  DOORS,
  COLLISION,
  type Door,
  type RoomKey,
} from '../config/worldLayout';
import { NPC_DEFINITIONS } from '../config/npcDefinitions';
import { cameraState } from '../systems/CameraState';

const CAMERA_ZOOM = 2;

export class WorldScene extends Phaser.Scene {
  private player!: PlayerSprite;
  private companion!: CompanionSprite;
  private animSystem!: AnimationSystem;
  private finder!: EasyStar.js;
  private navGrid: number[][] = [];
  private gridW = 0;
  private gridH = 0;
  private clickMarker: Phaser.GameObjects.Graphics | null = null;
  private editorGfx!: Phaser.GameObjects.Graphics;
  private editorMode = false;
  private editorCornerA: { x: number; y: number } | null = null;
  private currentDoor: Door | null = null;
  private doorPrompt: Phaser.GameObjects.Text | null = null;
  private doorHighlightGfx: Phaser.GameObjects.Graphics | null = null;
  private doorHighlightTarget: Door | null = null;
  private doorHighlightUntil = 0;
  private doorHighlightArrow: Phaser.GameObjects.Text | null = null;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private otherPlayers!: OtherPlayersManager;
  private npcManager!: NPCManager;
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create(data?: { spawnAt?: { x: number; y: number } }) {
    const bg = this.add.image(0, 0, 'world-bg').setOrigin(0, 0).setDepth(-10);
    bg.setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.setBackgroundColor('#0a0015');

    this.buildNavGrid();
    this.createCollisionBodies();

    const spawnX = data?.spawnAt?.x ?? SPAWN.x;
    const spawnY = data?.spawnAt?.y ?? SPAWN.y;

    this.animSystem = new AnimationSystem(this);
    this.player = new PlayerSprite(this, spawnX, spawnY);
    this.companion = new CompanionSprite(this, spawnX + 20, spawnY + 10);
    this.companion.setAnimationSystem(this.animSystem);

    this.physics.add.collider(this.player, this.collisionGroup);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.setupPathfinder();
    this.setupClickToMove();
    this.setupCompanionClick();
    this.setupEventBridge();
    this.setupEditor();
    this.setupDoorPrompt();
    this.setupOtherPlayers();
    this.npcManager = new NPCManager(this, NPC_DEFINITIONS);

    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.input.keyboard!.on('keydown-J', () => {
      EventBus.emit('journal-overlay-toggle');
    });

    this.input.keyboard!.on('keydown-T', () => {
      EventBus.emit('traits-overlay-toggle');
    });

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('edit') === '1') this.setEditorMode(true);
    }

    EventBus.emit('scene-ready', this);
  }

  private buildNavGrid() {
    this.gridW = Math.ceil(WORLD_WIDTH / NAV_CELL);
    this.gridH = Math.ceil(WORLD_HEIGHT / NAV_CELL);
    this.navGrid = Array.from({ length: this.gridH }, () =>
      Array.from({ length: this.gridW }, () => 0),
    );

    for (const rect of COLLISION) {
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
    for (const rect of COLLISION) {
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
      if (this.editorMode) {
        this.handleEditorClick(pointer);
        return;
      }
      if (pointer.rightButtonDown()) return;

      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const gx = Math.floor(worldX / NAV_CELL);
      const gy = Math.floor(worldY / NAV_CELL);
      if (gx < 0 || gy < 0 || gx >= this.gridW || gy >= this.gridH) return;
      if (this.navGrid[gy][gx] === 1) return;

      this.showClickMarker(worldX, worldY);

      const playerGx = Math.floor(this.player.x / NAV_CELL);
      const playerGy = Math.floor(this.player.y / NAV_CELL);
      this.finder.findPath(playerGx, playerGy, gx, gy, (path) => {
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

  private setupCompanionClick() {
    this.companion.setInteractive({ useHandCursor: true });
    this.companion.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.editorMode) return;
      const camera = this.cameras.main;
      const canvas = this.game.canvas;
      const screenX = (this.companion.x - camera.worldView.x) * camera.zoom + canvas.offsetLeft;
      const screenY = (this.companion.y - camera.worldView.y) * camera.zoom + canvas.offsetTop;
      EventBus.emit('companion-clicked', { screenX, screenY });
      pointer.event.stopPropagation();
    });
  }

  private setupEventBridge() {
    EventBus.on('companion-mood', (mood: string) => {
      const validMoods: CompanionMood[] = ['happy', 'calm', 'sleepy', 'excited', 'curious', 'idle'];
      if (validMoods.includes(mood as CompanionMood)) this.companion.setMood(mood as CompanionMood);
    });
    EventBus.on('companion-constellation', (constellation: string) => {
      const lower = constellation.toLowerCase() as Constellation;
      if ((CONSTELLATIONS as readonly string[]).includes(lower)) this.companion.setConstellation(lower);
    });
    EventBus.on('companion-away', (data: { away: boolean }) => {
      this.companion.setAway(!!data?.away);
    });
    EventBus.on('editor-mode', (enabled: boolean) => this.setEditorMode(enabled));
    EventBus.on('highlight-door', (data: { room: string }) => {
      this.highlightDoor(data?.room);
    });
    EventBus.on('room-exit', (data: { returnTo?: { x: number; y: number } }) => {
      if (this.scene.isSleeping()) {
        this.scene.stop('RoomScene');
        this.scene.wake();
        this.cameras.main.fadeIn(250, 0, 0, 0);
        if (data?.returnTo) {
          this.player.setPosition(data.returnTo.x, data.returnTo.y + 20);
          this.companion.setPosition(data.returnTo.x + 20, data.returnTo.y + 30);
        }
      }
    });
  }

  private setupOtherPlayers() {
    this.otherPlayers = new OtherPlayersManager(this);
    EventBus.on('remote-player-add', (player: RemotePlayer) => this.otherPlayers.addPlayer(player));
    EventBus.on('remote-player-remove', (sessionId: string) => this.otherPlayers.removePlayer(sessionId));
    EventBus.on('remote-player-update', (player: RemotePlayer) => this.otherPlayers.updatePlayer(player));
  }

  private setupDoorPrompt() {
    this.doorPrompt = this.add
      .text(0, 0, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '6px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(30)
      .setVisible(false);
    this.doorHighlightGfx = this.add.graphics().setDepth(29);
    this.doorHighlightArrow = this.add
      .text(0, 0, '▼', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#00f7ff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(31)
      .setVisible(false);
  }

  private highlightDoor(roomName: string | undefined) {
    if (!roomName) return;
    const door = DOORS.find((d) => d.room === roomName);
    if (!door) return;
    this.doorHighlightTarget = door;
    this.doorHighlightUntil = this.time.now + 5000;
    if (this.doorHighlightArrow) {
      this.doorHighlightArrow.setVisible(true);
    }
  }

  private updateDoorHighlight(time: number) {
    if (!this.doorHighlightGfx) return;
    if (!this.doorHighlightTarget || time > this.doorHighlightUntil) {
      this.doorHighlightGfx.clear();
      this.doorHighlightArrow?.setVisible(false);
      this.doorHighlightTarget = null;
      return;
    }
    const door = this.doorHighlightTarget;
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.006));
    this.doorHighlightGfx.clear();
    this.doorHighlightGfx.lineStyle(2, 0x00f7ff, pulse);
    const pad = 4;
    this.doorHighlightGfx.strokeRoundedRect(
      door.x - pad,
      door.y - pad,
      door.w + pad * 2,
      door.h + pad * 2,
      4,
    );
    this.doorHighlightGfx.lineStyle(1, 0xffd700, pulse * 0.8);
    this.doorHighlightGfx.strokeRoundedRect(
      door.x - pad - 3,
      door.y - pad - 3,
      door.w + pad * 2 + 6,
      door.h + pad * 2 + 6,
      6,
    );
    if (this.doorHighlightArrow) {
      const bob = Math.sin(time * 0.008) * 2;
      this.doorHighlightArrow.setPosition(door.x + door.w / 2, door.y - 6 + bob);
      this.doorHighlightArrow.setAlpha(pulse);
    }
  }

  private updateDoorDetection() {
    if (this.editorMode) {
      if (this.doorPrompt) this.doorPrompt.setVisible(false);
      this.currentDoor = null;
      return;
    }
    const px = this.player.x;
    const py = this.player.y;
    let inside: Door | null = null;
    for (const d of DOORS) {
      if (px >= d.x && px <= d.x + d.w && py >= d.y && py <= d.y + d.h) {
        inside = d;
        break;
      }
    }
    if (inside !== this.currentDoor) {
      if (this.currentDoor) EventBus.emit('location-exited', { name: this.currentDoor.room });
      if (inside) EventBus.emit('location-entered', { name: inside.room });
      this.currentDoor = inside;
    }
    if (inside && this.doorPrompt) {
      this.doorPrompt.setText(`[E] ENTER ${inside.room.toUpperCase()}`);
      this.doorPrompt.setPosition(inside.x + inside.w / 2, inside.y - 4);
      this.doorPrompt.setVisible(true);
    } else if (this.doorPrompt) {
      this.doorPrompt.setVisible(false);
    }
  }

  private enterDoor(door: Door) {
    const returnTo = { x: door.x + door.w / 2, y: door.y + door.h + 12 };
    EventBus.emit('door-entered', { room: door.room, returnTo });
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      this.scene.sleep();
      this.scene.launch('RoomScene', { room: door.room as RoomKey, returnTo });
    });
  }

  private setupEditor() {
    this.editorGfx = this.add.graphics().setDepth(50);
    this.redrawEditor();
  }

  setEditorMode(enabled: boolean) {
    this.editorMode = enabled;
    this.editorCornerA = null;
    this.redrawEditor();
  }

  private handleEditorClick(pointer: Phaser.Input.Pointer) {
    const x = Math.round(pointer.worldX);
    const y = Math.round(pointer.worldY);
    if (!this.editorCornerA) {
      this.editorCornerA = { x, y };
      this.redrawEditor();
      EventBus.emit('editor-corner', { corner: 'A', x, y });
    } else {
      const a = this.editorCornerA;
      const rx = Math.min(a.x, x);
      const ry = Math.min(a.y, y);
      const rw = Math.abs(x - a.x);
      const rh = Math.abs(y - a.y);
      this.editorCornerA = null;
      EventBus.emit('editor-rect', { x: rx, y: ry, w: rw, h: rh });
      this.redrawEditor();
    }
  }

  private redrawEditor() {
    this.editorGfx.clear();
    if (!this.editorMode) return;
    this.editorGfx.lineStyle(1, 0x00ff88, 1);
    for (const r of COLLISION) this.editorGfx.strokeRect(r.x, r.y, r.w, r.h);
    this.editorGfx.lineStyle(1, 0xffd700, 1);
    for (const d of DOORS) this.editorGfx.strokeRect(d.x, d.y, d.w, d.h);
    if (this.editorCornerA) {
      this.editorGfx.fillStyle(0xff00ff, 1);
      this.editorGfx.fillCircle(this.editorCornerA.x, this.editorCornerA.y, 3);
    }
  }

  update() {
    if (!this.player) return;
    const keyboardActive = this.player.handleKeyboardInput();
    if (!keyboardActive) this.player.updatePathMovement();
    this.companion.followPlayer(this.player.x, this.player.y, this.player.getDirection());
    this.otherPlayers.update(this.cameras.main);
    this.npcManager.update(this.time.now);
    this.updateDoorDetection();
    this.updateDoorHighlight(this.time.now);

    const cam = this.cameras.main;
    cameraState.viewX = cam.worldView.x;
    cameraState.viewY = cam.worldView.y;
    cameraState.zoom = cam.zoom;
    cameraState.localPlayerX = this.player.x;
    cameraState.localPlayerY = this.player.y;
    cameraState.companionX = this.companion.x;
    cameraState.companionY = this.companion.y;
    if (this.currentDoor && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.enterDoor(this.currentDoor);
    }
    if (this.editorMode) {
      EventBus.emit('editor-mouse', {
        x: Math.round(this.input.activePointer.worldX),
        y: Math.round(this.input.activePointer.worldY),
      });
    }
  }

  getLocalPlayerPosition(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  shutdown() {
    this.otherPlayers?.destroy();
    this.npcManager?.destroy();
    EventBus.off('companion-mood');
    EventBus.off('companion-constellation');
    EventBus.off('companion-away');
    EventBus.off('editor-mode');
    EventBus.off('highlight-door');
    EventBus.off('room-exit');
    EventBus.off('remote-player-add');
    EventBus.off('remote-player-remove');
    EventBus.off('remote-player-update');
  }
}
