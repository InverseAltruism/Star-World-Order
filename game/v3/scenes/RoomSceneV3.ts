import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSpriteV3 } from '../sprites/PlayerSpriteV3';
import { NPCSpriteV3 } from '../sprites/NPCSpriteV3';
import {
  NPCS_V3, npcSpriteKey,
  type BuildingId, type NPCDefV3, type NPCSheet,
} from '../config/npcDefinitionsV3';

const TILE = 32;
// Each interior backdrop is 256×192 and rendered at 2× → 512×384 room.
const BACKDROP_W = 256;
const BACKDROP_H = 192;
const ROOM_SCALE = 2;
const ROOM_W = BACKDROP_W * ROOM_SCALE;     // 512
const ROOM_H = BACKDROP_H * ROOM_SCALE;     // 384
const ROOM_ZOOM = 2;
const EXIT_GRACE_MS = 700;

// Per-room collision tuning. The RD-generated backdrops have walls and
// doorway openings drawn at specific pixel positions in the source 256×192
// image; we mirror them here at room (2×) scale so the player can walk
// where the floor visibly is and bumps where walls visibly are.
//
// All values are in **room-space pixels** (already multiplied by ROOM_SCALE).
// `wallTop` = top wall thickness, `wallBottom` = bottom wall thickness with
// `doorX/doorW` carving an opening in it, `wallSide` = left/right thickness.
interface RoomShape {
  wallTop: number;
  wallSide: number;
  wallBottom: number;
  doorX: number;
  doorW: number;
}

const ROOM_SHAPES: Record<BuildingId, RoomShape> = {
  // Backdrops generated at 256×192. Door is centred at the south wall in
  // each one. We use a uniform shape and override only where the art needs
  // it (e.g. the dream-hollow grotto has thick organic borders).
  observatory:        { wallTop: 56, wallSide: 28, wallBottom: 32, doorX: 232, doorW: 60 },
  'cosmic-library':   { wallTop: 56, wallSide: 36, wallBottom: 36, doorX: 232, doorW: 60 },
  'star-garden':      { wallTop: 56, wallSide: 32, wallBottom: 36, doorX: 232, doorW: 60 },
  'hot-springs':      { wallTop: 56, wallSide: 32, wallBottom: 36, doorX: 232, doorW: 60 },
  'training-grounds': { wallTop: 64, wallSide: 36, wallBottom: 40, doorX: 232, doorW: 60 },
  'dream-hollow':     { wallTop: 60, wallSide: 56, wallBottom: 40, doorX: 232, doorW: 60 },
  'nebula-kitchen':   { wallTop: 56, wallSide: 32, wallBottom: 36, doorX: 232, doorW: 60 },
  'aura-forge':       { wallTop: 56, wallSide: 36, wallBottom: 36, doorX: 232, doorW: 60 },
};

interface RoomLaunchData {
  roomId: BuildingId;
  returnTo: { x: number; y: number };
}

export class RoomSceneV3 extends Phaser.Scene {
  private roomId!: BuildingId;
  private returnTo!: { x: number; y: number };
  private player!: PlayerSpriteV3;
  private npc: NPCSpriteV3 | null = null;
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;
  private exiting = false;
  private exitArmedAt = 0;

  constructor() { super({ key: 'RoomSceneV3' }); }

  create(data: RoomLaunchData) {
    this.roomId = data.roomId;
    this.returnTo = data.returnTo;
    this.exiting = false;
    this.exitArmedAt = this.time.now + EXIT_GRACE_MS;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, ROOM_W, ROOM_H);
    cam.setZoom(ROOM_ZOOM);
    cam.setBackgroundColor(0x0a0015);
    cam.fadeIn(250, 0, 0, 0);
    this.physics.world.setBounds(0, 0, ROOM_W, ROOM_H);

    this.renderInterior();
    this.createCollision();
    this.spawnPlayer();
    this.spawnNPC();
    this.setupExit();
    this.setupHUD();

    EventBus.on('minigame-launch', this.handleMinigameLaunch, this);
    EventBus.on('minigame-exit', this.handleMinigameExit, this);

    EventBus.emit('scene-ready', this);
  }

  private renderInterior() {
    const key = `interior-v3-${this.roomId}`;
    if (this.textures.exists(key)) {
      this.add.image(0, 0, key).setOrigin(0, 0).setScale(ROOM_SCALE).setDepth(-10);
    } else {
      // Backstop — solid dark fill if asset missing. Should never hit in
      // production; logged so it shows up in the dev console.
      const g = this.add.graphics().setDepth(-10);
      g.fillStyle(0x1a1422, 1).fillRect(0, 0, ROOM_W, ROOM_H);
      console.warn(`[RoomSceneV3] missing interior texture: ${key}`);
    }
  }

  private createCollision() {
    this.collisionGroup = this.physics.add.staticGroup();
    const s = ROOM_SHAPES[this.roomId];
    // Bottom wall split around the south door opening.
    const wallRects = [
      // top wall
      { x: 0, y: 0, w: ROOM_W, h: s.wallTop },
      // left wall
      { x: 0, y: 0, w: s.wallSide, h: ROOM_H },
      // right wall
      { x: ROOM_W - s.wallSide, y: 0, w: s.wallSide, h: ROOM_H },
      // bottom-left of south wall (up to door opening)
      { x: 0, y: ROOM_H - s.wallBottom, w: s.doorX, h: s.wallBottom },
      // bottom-right of south wall (after door opening)
      { x: s.doorX + s.doorW, y: ROOM_H - s.wallBottom, w: ROOM_W - (s.doorX + s.doorW), h: s.wallBottom },
    ];
    for (const r of wallRects) {
      if (r.w <= 0 || r.h <= 0) continue;
      const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.physics.add.existing(zone, true);
      this.collisionGroup.add(zone);
    }
  }

  private spawnPlayer() {
    // Spawn the player one tile inside the south doorway, facing into the room.
    const s = ROOM_SHAPES[this.roomId];
    const sx = s.doorX + s.doorW / 2;
    const sy = ROOM_H - s.wallBottom - 24;
    this.player = new PlayerSpriteV3(this, sx, sy);
    this.physics.add.collider(this.player, this.collisionGroup);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
  }

  private spawnNPC() {
    const def = NPCS_V3.find(n => n.zone === this.roomId);
    if (!def) return;
    if (!this.textures.exists(npcSpriteKey(def.id as NPCSheet))) return;
    // Place NPC slightly north-of-centre so the player walks toward them.
    const placed: NPCDefV3 = {
      ...def,
      x: ROOM_W / 2,
      y: ROOM_H * 0.55,
    };
    this.npc = new NPCSpriteV3(this, placed);
  }

  private setupExit() {
    const s = ROOM_SHAPES[this.roomId];
    // Trigger zone in the floor of the doorway gap. Slightly inset from the
    // outer wall so we don't fight the wall colliders.
    const zone = this.add.zone(
      s.doorX + s.doorW / 2,
      ROOM_H - s.wallBottom + 8,
      s.doorW - 8,
      16,
    );
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => this.exit());

    this.add
      .text(s.doorX + s.doorW / 2, ROOM_H - s.wallBottom - 8, '[E] EXIT', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#ff66aa',
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: 'rgba(10,0,21,0.8)',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.input.keyboard!.on('keydown-ESC', () => this.exit());
    this.input.keyboard!.on('keydown-E',   () => this.exit());
  }

  private setupHUD() {
    const screenW = this.scale.width;
    this.add
      .text(screenW / 2, 16, this.roomId.toUpperCase().replace(/-/g, ' '), {
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
        returnRoom: this.roomId,
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
    if (!payload?.returnRoom || payload.returnRoom !== this.roomId) return;
    if (!this.scene.isSleeping()) return;
    if (payload.sceneKey && this.scene.manager.getScene(payload.sceneKey)) {
      this.scene.stop(payload.sceneKey);
    } else {
      const keys = [
        'StarCatchScene', 'MemoryMatchScene', 'StarConnectScene',
        'ForgeHammerScene', 'LoreTriviaScene', 'CookingRhythmScene',
        'DreamCatcherScene',
      ];
      for (const k of keys) {
        if (this.scene.manager.getScene(k)?.scene.isActive()) this.scene.stop(k);
      }
    }
    this.scene.wake();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    if (payload.returnTo && this.player) {
      this.player.setPosition(payload.returnTo.x, payload.returnTo.y);
    }
  }

  private exit() {
    if (this.exiting) return;
    if (this.time.now < this.exitArmedAt) return;
    this.exiting = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      EventBus.emit('roomv3-exit', { returnTo: this.returnTo });
    });
  }

  update(time: number) {
    if (!this.player || this.exiting) return;
    this.player.handleInput();
    this.npc?.update(time);
  }

  shutdown() {
    EventBus.off('minigame-launch', this.handleMinigameLaunch, this);
    EventBus.off('minigame-exit', this.handleMinigameExit, this);
  }
}
