import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSpriteV3 } from '../sprites/PlayerSpriteV3';
import { NPCSpriteV3 } from '../sprites/NPCSpriteV3';
import {
  NPCS_V3,
  type BuildingId,
  type NPCDefV3,
  type NPCSheet,
} from '../config/npcDefinitionsV3';

const CAMERA_ZOOM = 1.5;
const WATER_FPS = 6;
const TILE = 32;

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
  private npcs: NPCSpriteV3[] = [];
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;
  private waterSprites: Phaser.GameObjects.Sprite[] = [];
  private doors: DoorMarker[] = [];
  private currentDoor: DoorMarker | null = null;
  private doorPrompt: Phaser.GameObjects.Text | null = null;
  private interactKey!: Phaser.Input.Keyboard.Key;

  constructor() { super({ key: 'WorldSceneV3' }); }

  create() {
    // -------- Tilemap --------
    const map = this.make.tilemap({ key: 'overworld' });
    const fmTileset = map.addTilesetImage('forgotten-memories', 'fm-tileset');
    if (!fmTileset) throw new Error('forgotten-memories tileset failed to attach');

    const groundLayer = map.createLayer('ground', fmTileset, 0, 0);
    if (!groundLayer) throw new Error('ground layer missing from overworld.json');
    groundLayer.setDepth(-10);

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
    for (const o of collide) {
      const cx = (o.x ?? 0) + (o.width ?? 0) / 2;
      const cy = (o.y ?? 0) + (o.height ?? 0) / 2;
      const zone = this.add.zone(cx, cy, o.width ?? 32, o.height ?? 32);
      this.physics.add.existing(zone, true);
      this.collisionGroup.add(zone);
    }

    // -------- Spawn the player --------
    // Pick spawn from the NPCs object layer's 'spawn-fox' position; if missing
    // fall back to map centre. Player is offset 2 tiles south of spawn fox.
    const npcObjs = map.getObjectLayer('npcs')?.objects ?? [];
    const fox = npcObjs.find(o => o.name === 'spawn-fox');
    const spawnX = fox ? (fox.x ?? 0) - 64 : worldW / 2;
    const spawnY = fox ? (fox.y ?? 0) + 32 : worldH / 2;
    this.player = new PlayerSpriteV3(this, spawnX, spawnY);
    this.physics.add.collider(this.player, this.collisionGroup);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

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
        fontFamily: '"Press Start 2P", monospace',
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
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      this.scene.sleep();
      this.scene.launch('RoomSceneV3', { roomId: door.roomId, returnTo });
    });
  }

  shutdown() {
    EventBus.off('roomv3-exit', this.handleRoomExit, this);
  }

  update(time: number) {
    if (!this.player) return;
    this.player.handleInput();
    for (const npc of this.npcs) npc.update(time);
    this.updateDoorDetection();
    if (this.currentDoor && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.enterDoor(this.currentDoor);
    }
  }
}
