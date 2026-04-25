import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSpriteV3 } from '../sprites/PlayerSpriteV3';
import { NPCSpriteV3 } from '../sprites/NPCSpriteV3';
import { NPCS_V3, type NPCDefV3, type NPCSheet } from '../config/npcDefinitionsV3';

const CAMERA_ZOOM = 1.5;
const WATER_FPS = 6;

export class WorldSceneV3 extends Phaser.Scene {
  private player!: PlayerSpriteV3;
  private npcs: NPCSpriteV3[] = [];
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;
  private waterSprites: Phaser.GameObjects.Sprite[] = [];

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

    EventBus.emit('scene-ready', this);
  }

  update(time: number) {
    if (!this.player) return;
    this.player.handleInput();
    for (const npc of this.npcs) npc.update(time);
  }
}
