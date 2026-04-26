import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSpriteV3 } from '../sprites/PlayerSpriteV3';
import { NPCSpriteV3 } from '../sprites/NPCSpriteV3';
import {
  NPCS_V3, npcSpriteKey,
  type BuildingId, type NPCDefV3, type NPCSheet,
} from '../config/npcDefinitionsV3';

const TILE = 32;
const ROOM_COLS = 16;
const ROOM_ROWS = 12;
const ROOM_W = ROOM_COLS * TILE;     // 512
const ROOM_H = ROOM_ROWS * TILE;     // 384
const ROOM_ZOOM = 2;
const EXIT_GRACE_MS = 700;

// Forgotten Memories tile crops for floor + wall.
const FLOOR_FRAME = { x: 32, y: 32, w: TILE, h: TILE };  // stone-mid
const FLOOR_LIGHT_FRAME = { x: 64, y: 32, w: TILE, h: TILE }; // stone-bright
const WALL_FRAME  = { x: 32, y: 64, w: TILE, h: TILE };  // dirt (rich brown for wood-floor look)

// One signature prop per zone (FM-side prop sheet keys we already preload).
const ROOM_PROP: Record<BuildingId, string> = {
  observatory:       'telescope',
  'cosmic-library':  'star-chart',
  'star-garden':     'star-flower',
  'hot-springs':     'moon-lantern',
  'training-grounds':'training-dummy',
  'dream-hollow':    'dream-mushroom',
  'nebula-kitchen':  'crystal-stove',
  'aura-forge':      'crystal-anvil',
};

const ZONE_TINT: Record<BuildingId, number> = {
  observatory:        0x223344,
  'cosmic-library':   0x2a2236,
  'star-garden':      0x223a2c,
  'hot-springs':      0x3a2a30,
  'training-grounds': 0x332520,
  'dream-hollow':     0x2c2238,
  'nebula-kitchen':   0x3a2c1f,
  'aura-forge':       0x3a2018,
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
    cam.setBackgroundColor(ZONE_TINT[this.roomId] ?? 0x0a0015);
    cam.fadeIn(250, 0, 0, 0);
    this.physics.world.setBounds(0, 0, ROOM_W, ROOM_H);

    this.renderInterior();
    this.createCollision();
    this.spawnPlayer();
    this.spawnNPC();
    this.setupExit();
    this.setupHUD();

    EventBus.emit('scene-ready', this);
  }

  private renderInterior() {
    // Render the floor + wall border via a RenderTexture using FM crops.
    const rt = this.add.renderTexture(0, 0, ROOM_W, ROOM_H).setOrigin(0, 0).setDepth(-10);
    const fm = this.textures.get('fm-tileset');

    const placeFrame = (frame: typeof FLOOR_FRAME, dx: number, dy: number) => {
      const name = `room-${frame.x}-${frame.y}`;
      if (!fm.has(name)) fm.add(name, 0, frame.x, frame.y, frame.w, frame.h);
      rt.drawFrame('fm-tileset', name, dx, dy);
    };

    for (let y = 0; y < ROOM_ROWS; y++) {
      for (let x = 0; x < ROOM_COLS; x++) {
        const isWall = (y === 0 || y === ROOM_ROWS - 1 || x === 0 || x === ROOM_COLS - 1);
        const variant = ((x + y) & 7) === 0;
        const frame = isWall ? WALL_FRAME : (variant ? FLOOR_LIGHT_FRAME : FLOOR_FRAME);
        placeFrame(frame, x * TILE, y * TILE);
      }
    }

    // Subtle vignette + nameplate.
    const vignette = this.add.graphics().setDepth(-9);
    vignette.fillStyle(0x000000, 0.15);
    vignette.fillRect(0, 0, ROOM_W, ROOM_H);

    // Room signature prop, placed slightly north of centre.
    const propKey = `prop-v3-${ROOM_PROP[this.roomId]}`;
    if (this.textures.exists(propKey)) {
      this.add.image(ROOM_W / 2, ROOM_H / 2 - 32, propKey).setOrigin(0.5, 1).setDepth(6);
    }
  }

  private createCollision() {
    this.collisionGroup = this.physics.add.staticGroup();
    const T = TILE;
    // Bottom wall has a 3-tile gap in the middle for the exit; build it as
    // two segments either side of the gap.
    const bottomGapHalf = (3 * T) / 2;
    const bottomLeftEnd = ROOM_W / 2 - bottomGapHalf;
    const bottomRightStart = ROOM_W / 2 + bottomGapHalf;
    const wallRects = [
      { x: 0,                y: 0,            w: ROOM_W,                       h: T },           // top
      { x: 0,                y: 0,            w: T,                            h: ROOM_H },      // left
      { x: ROOM_W - T,       y: 0,            w: T,                            h: ROOM_H },      // right
      { x: 0,                y: ROOM_H - T,   w: bottomLeftEnd,                h: T },           // bottom-left segment
      { x: bottomRightStart, y: ROOM_H - T,   w: ROOM_W - bottomRightStart,    h: T },           // bottom-right segment
    ];
    for (const r of wallRects) {
      const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.physics.add.existing(zone, true);
      this.collisionGroup.add(zone);
    }
  }

  private spawnPlayer() {
    // Spawn the player just north of the bottom-centre exit gap.
    const sx = ROOM_W / 2;
    const sy = ROOM_H - TILE * 2;
    this.player = new PlayerSpriteV3(this, sx, sy);
    this.physics.add.collider(this.player, this.collisionGroup);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
  }

  private spawnNPC() {
    // Pull the NPC for this zone from the canonical list.
    const def = NPCS_V3.find(n => n.zone === this.roomId);
    if (!def) return;
    const placed: NPCDefV3 = {
      ...def,
      x: ROOM_W / 2,
      y: ROOM_H / 2 + 24,
    };
    // Make sure the sheet is registered (BootSceneV3 already preloads them).
    if (!this.textures.exists(npcSpriteKey(def.id as NPCSheet))) return;
    this.npc = new NPCSpriteV3(this, placed);
  }

  private setupExit() {
    const gapW = 3 * TILE;
    const gapX = ROOM_W / 2 - gapW / 2;
    const gapY = ROOM_H - TILE - 4;
    const zone = this.add.zone(gapX + gapW / 2, gapY + 8, gapW, 16);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => this.exit());

    // Visible "[E] EXIT" hint.
    this.add
      .text(ROOM_W / 2, ROOM_H - TILE - 18, '[E] EXIT', {
        fontFamily: '"Pixelify Sans", monospace',
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
        fontFamily: '"Pixelify Sans", monospace',
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
}
