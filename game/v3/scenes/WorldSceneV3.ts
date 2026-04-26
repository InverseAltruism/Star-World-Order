import Phaser from 'phaser';
import * as EasyStar from 'easystarjs';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSpriteV3 } from '../sprites/PlayerSpriteV3';
import { NPCSpriteV3 } from '../sprites/NPCSpriteV3';
import {
  NPCS_V3,
  type BuildingId,
  type NPCDefV3,
  type NPCSheet,
} from '../config/npcDefinitionsV3';
import { CompanionSprite } from '../../sprites/CompanionSprite';
import {
  AnimationSystem,
  CONSTELLATIONS,
  type CompanionMood,
  type Constellation,
} from '../../systems/AnimationSystem';
import {
  COSMETIC_SLOTS,
  type CosmeticSlot,
  type EquippedCosmetics,
} from '../../systems/CosmeticSystem';

const CAMERA_ZOOM = 1.5;
const WATER_FPS = 6;
const TILE = 32;
const NAV_CELL = 16; // half-tile pathfinding grid, matches V2's WorldScene

interface DoorMarker {
  roomId: BuildingId;
  /** centre */
  x: number;
  y: number;
  w: number;
  h: number;
}

export class WorldSceneV3 extends Phaser.Scene {
  private player!: PlayerSpriteV3;
  private companion!: CompanionSprite;
  private animSystem!: AnimationSystem;
  private npcs: NPCSpriteV3[] = [];
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;
  private waterSprites: Phaser.GameObjects.Sprite[] = [];
  private doors: DoorMarker[] = [];
  private currentDoor: DoorMarker | null = null;
  private doorPrompt: Phaser.GameObjects.Text | null = null;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private finder!: EasyStar.js;
  private navGrid: number[][] = [];
  private gridW = 0;
  private gridH = 0;
  private clickMarker: Phaser.GameObjects.Graphics | null = null;

  constructor() { super({ key: 'WorldSceneV3' }); }

  create() {
    // -------- Tilemap --------
    const map = this.make.tilemap({ key: 'overworld' });
    const fmTileset = map.addTilesetImage('forgotten-memories', 'fm-tileset');
    if (!fmTileset) throw new Error('forgotten-memories tileset failed to attach');

    const groundLayer = map.createLayer('ground', fmTileset, 0, 0);
    if (!groundLayer) throw new Error('ground layer missing from overworld.json');
    groundLayer.setDepth(-10);

    // Optional decoration overlay — sparse transparent grass tufts on top of
    // ground to break up the carpet look. Older overworld.json files may not
    // have this layer; the renderer no-ops if it's missing.
    const decorationLayer = map.createLayer('ground_decoration', fmTileset, 0, 0);
    if (decorationLayer) decorationLayer.setDepth(-9);

    const worldW = map.widthInPixels;
    const worldH = map.heightInPixels;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.setBackgroundColor('#0a0015');

    // -------- Buildings (object layer) --------
    const buildings = map.getObjectLayer('buildings')?.objects ?? [];
    for (const o of buildings) {
      // Tiled object x/y is top-left for image objects when no gid; for our
      // un-gid'd objects we used (col*TILE, row*TILE) as the centre, with
      // width/height = 128. Re-compute the centre:
      const cx = (o.x ?? 0) + (o.width ?? 0) / 2;
      const cy = (o.y ?? 0) + (o.height ?? 0) / 2;
      const key = `building-v3-${o.name}`;
      if (!this.textures.exists(key)) continue;
      this.add.image(cx, cy, key).setOrigin(0.5).setDepth(5);
    }

    // -------- Props --------
    const props = map.getObjectLayer('props')?.objects ?? [];
    for (const o of props) {
      const key = `prop-v3-${o.name}`;
      if (!this.textures.exists(key)) continue;
      const px = (o.x ?? 0) + (o.width ?? 0) / 2;
      // Props use bottom-anchor convention: y is the BOTTOM of the prop sprite.
      const py = (o.y ?? 0) + (o.height ?? 0);
      this.add.image(px, py, key).setOrigin(0.5, 1).setDepth(6);
    }

    // -------- Animated water --------
    if (!this.anims.exists('water-flow')) {
      this.anims.create({
        key: 'water-flow',
        frames: this.anims.generateFrameNumbers('fm-water', { start: 0, end: 5 }),
        frameRate: WATER_FPS,
        repeat: -1,
      });
    }
    const water = map.getObjectLayer('water')?.objects ?? [];
    for (const o of water) {
      // Tile the 128×128 water sprite across the region defined by the object.
      const w = o.width ?? 128;
      const h = o.height ?? 128;
      const tilesX = Math.ceil(w / 128);
      const tilesY = Math.ceil(h / 128);
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const wx = (o.x ?? 0) + tx * 128;
          const wy = (o.y ?? 0) + ty * 128;
          const s = this.add.sprite(wx, wy, 'fm-water', 0).setOrigin(0, 0).setDepth(-5);
          s.play('water-flow');
          this.waterSprites.push(s);
        }
      }
    }

    // -------- Collision --------
    this.collisionGroup = this.physics.add.staticGroup();
    const collide = map.getObjectLayer('collision')?.objects ?? [];
    const collisionRects: { x: number; y: number; w: number; h: number }[] = [];
    for (const o of collide) {
      const w = o.width ?? 32;
      const h = o.height ?? 32;
      const ox = o.x ?? 0;
      const oy = o.y ?? 0;
      const cx = ox + w / 2;
      const cy = oy + h / 2;
      const zone = this.add.zone(cx, cy, w, h);
      this.physics.add.existing(zone, true);
      this.collisionGroup.add(zone);
      collisionRects.push({ x: ox, y: oy, w, h });
    }

    // -------- Pathfinding nav grid + finder --------
    // Mirrors V2 WorldScene's setup so click-to-move feels the same. The
    // grid blocks every cell touched by a collision rect.
    this.gridW = Math.ceil(worldW / NAV_CELL);
    this.gridH = Math.ceil(worldH / NAV_CELL);
    this.navGrid = Array.from({ length: this.gridH }, () =>
      Array.from({ length: this.gridW }, () => 0),
    );
    for (const rect of collisionRects) {
      const x0 = Math.max(0, Math.floor(rect.x / NAV_CELL));
      const y0 = Math.max(0, Math.floor(rect.y / NAV_CELL));
      const x1 = Math.min(this.gridW - 1, Math.floor((rect.x + rect.w - 1) / NAV_CELL));
      const y1 = Math.min(this.gridH - 1, Math.floor((rect.y + rect.h - 1) / NAV_CELL));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) this.navGrid[y][x] = 1;
      }
    }
    this.finder = new EasyStar.js();
    this.finder.setGrid(this.navGrid);
    this.finder.setAcceptableTiles([0]);
    this.finder.enableDiagonals();
    this.finder.setIterationsPerCalculation(200);

    // -------- Spawn the player --------
    // Pick spawn from the NPCs object layer's 'spawn-fox' position; if missing
    // fall back to map centre. Player is offset 2 tiles south of spawn fox.
    const npcObjs = map.getObjectLayer('npcs')?.objects ?? [];
    const fox = npcObjs.find(o => o.name === 'spawn-fox');
    const spawnX = fox ? (fox.x ?? 0) - 64 : worldW / 2;
    const spawnY = fox ? (fox.y ?? 0) + 32 : worldH / 2;
    this.player = new PlayerSpriteV3(this, spawnX, spawnY);
    this.player.setNavCell(NAV_CELL);
    this.physics.add.collider(this.player, this.collisionGroup);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.setupClickToMove();

    // -------- Companion --------
    // Reuses V2's CompanionSprite + AnimationSystem (cosmic-palette assets).
    // FM-palette companion sheets are tracked under [SWO_V3_COMPANION_FM_PALETTE]
    // and will swap textures here once generated.
    this.animSystem = new AnimationSystem(this);
    this.companion = new CompanionSprite(this, spawnX + 20, spawnY + 10);
    this.companion.setAnimationSystem(this.animSystem);
    this.setupCompanionInteraction();
    this.setupCompanionEventBridge();

    // -------- NPCs --------
    // The map declares which NPC sheet to render at each spot; we look up the
    // matching definition (for name + dialogue). Unknown names get a fallback.
    const npcByKey: Partial<Record<NPCSheet, NPCDefV3>> = {};
    for (const def of NPCS_V3) npcByKey[def.id] = def;
    for (const o of npcObjs) {
      const sheet = o.name as NPCSheet;
      const baseDef = npcByKey[sheet];
      if (!baseDef) continue;
      const def: NPCDefV3 = {
        ...baseDef,
        x: (o.x ?? 0) + (o.width ?? 0) / 2,
        y: (o.y ?? 0) + (o.height ?? 0) / 2,
      };
      this.npcs.push(new NPCSpriteV3(this, def));
    }

    // -------- Doors --------
    const doorObjs = map.getObjectLayer('doors')?.objects ?? [];
    for (const o of doorObjs) {
      this.doors.push({
        roomId: o.name as BuildingId,
        x: (o.x ?? 0) + (o.width ?? 0) / 2,
        y: (o.y ?? 0) + (o.height ?? 0) / 2,
        w: o.width ?? TILE,
        h: o.height ?? TILE,
      });
    }
    this.doorPrompt = this.add
      .text(0, 0, '', {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '8px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: 'rgba(10,0,21,0.85)',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(30)
      .setVisible(false);
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // -------- Room-exit handler --------
    EventBus.on('roomv3-exit', this.handleRoomExit, this);

    EventBus.emit('scene-ready', this);
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
    this.clickMarker.setAlpha(1);
    this.tweens.add({
      targets: this.clickMarker,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        this.clickMarker?.clear();
      },
    });
  }

  private setupCompanionInteraction() {
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

  private setupCompanionEventBridge() {
    EventBus.on('companion-mood', this.onCompanionMood, this);
    EventBus.on('companion-constellation', this.onCompanionConstellation, this);
    EventBus.on('companion-away', this.onCompanionAway, this);
    EventBus.on('companion-equip-cosmetic', this.onCompanionEquip, this);
    EventBus.on('companion-unequip-cosmetic', this.onCompanionUnequip, this);
    EventBus.on('companion-cosmetics', this.onCompanionCosmetics, this);
  }

  private onCompanionMood(mood: string) {
    const valid: CompanionMood[] = ['happy', 'calm', 'sleepy', 'excited', 'curious', 'idle'];
    if (valid.includes(mood as CompanionMood)) this.companion.setMood(mood as CompanionMood);
  }

  private onCompanionConstellation(constellation: string) {
    const lower = constellation.toLowerCase() as Constellation;
    if ((CONSTELLATIONS as readonly string[]).includes(lower)) {
      void this.companion.setConstellation(lower);
    }
  }

  private onCompanionAway(data: { away: boolean }) {
    this.companion.setAway(!!data?.away);
  }

  private onCompanionEquip(data: { slot: string; cosmeticId: string }) {
    if (!data) return;
    if (!(COSMETIC_SLOTS as readonly string[]).includes(data.slot)) return;
    this.companion.equipCosmetic(data.slot as CosmeticSlot, data.cosmeticId);
  }

  private onCompanionUnequip(data: { slot: string }) {
    if (!data) return;
    if (!(COSMETIC_SLOTS as readonly string[]).includes(data.slot)) return;
    this.companion.unequipCosmetic(data.slot as CosmeticSlot);
  }

  private onCompanionCosmetics(data: EquippedCosmetics | string) {
    if (typeof data === 'string') {
      this.companion.applyEquippedCosmeticsJson(data);
    } else if (data && typeof data === 'object') {
      this.companion.applyEquippedCosmetics(data);
    }
  }

  private handleRoomExit(payload: { returnTo?: { x: number; y: number } } = {}) {
    if (!this.scene.isSleeping()) return;
    const known = ['RoomSceneV3'];
    for (const k of known) {
      if (this.scene.manager.getScene(k)?.scene.isActive()) this.scene.stop(k);
    }
    this.scene.wake();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    if (payload.returnTo && this.player) {
      // Place the player just south of the door so they don't immediately
      // re-trigger entry.
      this.player.setPosition(payload.returnTo.x, payload.returnTo.y + TILE);
    }
    this.currentDoor = null;
    if (this.doorPrompt) this.doorPrompt.setVisible(false);
  }

  private updateDoorDetection() {
    const px = this.player.x, py = this.player.y;
    let inside: DoorMarker | null = null;
    for (const d of this.doors) {
      // Treat the door as a slightly-inflated rect so the player can stand
      // beside it instead of needing pixel-precise alignment.
      const half = TILE;
      if (px > d.x - d.w / 2 - half && px < d.x + d.w / 2 + half &&
          py > d.y - d.h / 2 - half && py < d.y + d.h / 2 + half) {
        inside = d;
        break;
      }
    }
    this.currentDoor = inside;
    if (inside && this.doorPrompt) {
      this.doorPrompt.setText(`[E] ENTER ${inside.roomId.toUpperCase().replace(/-/g, ' ')}`);
      this.doorPrompt.setPosition(inside.x, inside.y - 6);
      this.doorPrompt.setVisible(true);
    } else if (this.doorPrompt) {
      this.doorPrompt.setVisible(false);
    }
  }

  private enterDoor(door: DoorMarker) {
    const returnTo = { x: door.x, y: door.y };
    EventBus.emit('room-entered', { room: door.roomId, source: 'world-v3' });
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      this.scene.sleep();
      this.scene.launch('RoomSceneV3', { roomId: door.roomId, returnTo });
    });
  }

  shutdown() {
    EventBus.off('roomv3-exit', this.handleRoomExit, this);
    EventBus.off('companion-mood', this.onCompanionMood, this);
    EventBus.off('companion-constellation', this.onCompanionConstellation, this);
    EventBus.off('companion-away', this.onCompanionAway, this);
    EventBus.off('companion-equip-cosmetic', this.onCompanionEquip, this);
    EventBus.off('companion-unequip-cosmetic', this.onCompanionUnequip, this);
    EventBus.off('companion-cosmetics', this.onCompanionCosmetics, this);
  }

  update(time: number) {
    if (!this.player) return;
    const keyboardActive = this.player.handleInput();
    if (!keyboardActive) this.player.updatePathMovement();
    if (this.companion) {
      this.companion.followPlayer(this.player.x, this.player.y, this.player.getDirection());
    }
    for (const npc of this.npcs) npc.update(time);
    this.updateDoorDetection();
    if (this.currentDoor && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.enterDoor(this.currentDoor);
    }
  }
}
