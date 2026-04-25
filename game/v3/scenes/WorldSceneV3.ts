import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSpriteV3 } from '../sprites/PlayerSpriteV3';
import { NPCSpriteV3 } from '../sprites/NPCSpriteV3';
import { NPCS_V3 } from '../config/npcDefinitionsV3';
import {
  TILE, WORLD_W, WORLD_H, WORLD_TILES_W, WORLD_TILES_H,
  SPAWN, BUILDINGS, buildingCollisions,
} from '../config/worldLayoutV3';

const CAMERA_ZOOM = 1.5;

// Tile crops inside fm-tileset.png we found visually. Coordinates are in
// the source tileset (2048×2048, 32px grid = 64 tiles wide). These are
// best-guess crops chosen from the FM atlas; refinable later when we author
// proper tilemap data.
const TILE_CROPS = {
  grass:        { x: 32,  y: 0   },
  grassDark:    { x: 64,  y: 0   },
  dirt:         { x: 32,  y: 64  },
  stonePath:    { x: 32,  y: 32  },
  stonePathLt:  { x: 64,  y: 32  },
};

export class WorldSceneV3 extends Phaser.Scene {
  private player!: PlayerSpriteV3;
  private npcs: NPCSpriteV3[] = [];
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;

  constructor() { super({ key: 'WorldSceneV3' }); }

  create() {
    this.cameras.main.setBackgroundColor('#0a0015');
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setZoom(CAMERA_ZOOM);

    this.renderGround();
    this.renderBuildings();
    this.renderProps();
    this.createCollision();

    // Player.
    this.player = new PlayerSpriteV3(this, SPAWN.x, SPAWN.y);
    this.physics.add.collider(this.player, this.collisionGroup);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // NPCs.
    for (const def of NPCS_V3) {
      this.npcs.push(new NPCSpriteV3(this, def));
    }

    EventBus.emit('scene-ready', this);
  }

  /** Render the 40×28 ground layer using FM tile crops. */
  private renderGround() {
    // We render each tile by extracting a 32×32 crop from the master tileset
    // texture and placing it. To keep this fast, we use a single composite
    // RenderTexture rather than 1120 individual sprites.
    const rt = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(-10);

    const tileTex = this.textures.get('fm-tileset');
    const placeTile = (cropX: number, cropY: number, dstX: number, dstY: number) => {
      // Use Phaser's Frame mechanism: a temporary frame name pointing at the crop.
      const frameName = `tile-${cropX}-${cropY}`;
      if (!tileTex.has(frameName)) tileTex.add(frameName, 0, cropX, cropY, TILE, TILE);
      rt.drawFrame('fm-tileset', frameName, dstX, dstY);
    };

    // Base layer: grass everywhere with subtle variation.
    for (let ty = 0; ty < WORLD_TILES_H; ty++) {
      for (let tx = 0; tx < WORLD_TILES_W; tx++) {
        const x = tx * TILE, y = ty * TILE;
        const crop = ((tx + ty) & 7) === 0 ? TILE_CROPS.grassDark : TILE_CROPS.grass;
        placeTile(crop.x, crop.y, x, y);
      }
    }

    // A simple cross of stone path: horizontal across centre + vertical down centre.
    const cy = Math.floor(WORLD_TILES_H / 2);
    const cx = Math.floor(WORLD_TILES_W / 2);
    for (let tx = 0; tx < WORLD_TILES_W; tx++) {
      placeTile(TILE_CROPS.stonePath.x, TILE_CROPS.stonePath.y, tx * TILE, cy * TILE);
    }
    for (let ty = 0; ty < WORLD_TILES_H; ty++) {
      placeTile(TILE_CROPS.stonePath.x, TILE_CROPS.stonePath.y, cx * TILE, ty * TILE);
    }
  }

  private renderBuildings() {
    for (const b of BUILDINGS) {
      const img = this.add.image(b.x, b.y, `building-v3-${b.id}`).setOrigin(0.5, 0.5);
      img.setDepth(5);
    }
  }

  /** A few SWO themed prop placements scattered around for atmosphere. */
  private renderProps() {
    const place = (key: string, x: number, y: number, depth = 6) =>
      this.add.image(x, y, `prop-v3-${key}`).setOrigin(0.5, 1).setDepth(depth);

    // Spawn-area: a signpost + a cosmic well so it's recognizable as the hub.
    place('signpost',     SPAWN.x - 80,  SPAWN.y + 16);
    place('cosmic-well',  SPAWN.x + 96,  SPAWN.y + 8);

    // Some star flowers and dream mushrooms scattered through the grass.
    const scatters: Array<[string, number, number]> = [
      ['star-flower',     5 * TILE,  10 * TILE],
      ['star-flower',     12 * TILE, 11 * TILE],
      ['star-flower',     33 * TILE, 9 * TILE],
      ['dream-mushroom',  17 * TILE, 10 * TILE],
      ['dream-mushroom',  9 * TILE,  17 * TILE],
      ['rune-stone',      20 * TILE, 6 * TILE],
      ['rune-stone',      26 * TILE, 22 * TILE],
      ['seed-sprout',     21 * TILE, 18 * TILE],
      ['floating-stone',  15 * TILE, 6 * TILE],
    ];
    for (const [k, x, y] of scatters) place(k, x, y);

    // Per-zone signature props next to each building.
    place('telescope',      BUILDINGS[0].x + 80,  BUILDINGS[0].y + 32); // observatory
    place('star-chart',     BUILDINGS[1].x + 80,  BUILDINGS[1].y + 32); // library
    place('star-banner',    BUILDINGS[2].x - 80,  BUILDINGS[2].y + 32); // garden
    place('moon-lantern',   BUILDINGS[3].x + 80,  BUILDINGS[3].y + 32); // hot springs
    place('training-dummy', BUILDINGS[4].x + 80,  BUILDINGS[4].y + 32); // training
    place('crystal-stove',  BUILDINGS[6].x + 80,  BUILDINGS[6].y + 32); // kitchen
    place('crystal-anvil',  BUILDINGS[7].x + 80,  BUILDINGS[7].y + 32); // forge
  }

  private createCollision() {
    this.collisionGroup = this.physics.add.staticGroup();
    for (const r of buildingCollisions()) {
      const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.physics.add.existing(zone, true);
      this.collisionGroup.add(zone);
    }
  }

  update(time: number) {
    if (!this.player) return;
    this.player.handleInput();
    for (const npc of this.npcs) npc.update(time);
  }
}
