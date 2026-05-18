import * as Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSpriteV3 } from '../sprites/PlayerSpriteV3';
import { NPCSpriteV3 } from '../sprites/NPCSpriteV3';
import { NPCS_V3, BUILDING_IDS } from '../config/npcDefinitionsV3';
import { CompanionSprite } from '../../sprites/CompanionSprite';
import { AnimationSystem } from '../../systems/AnimationSystem';

export class BootSceneV3 extends Phaser.Scene {
  constructor() { super({ key: 'BootSceneV3' }); }

  preload() {
    EventBus.emit('boot-progress', { phase: 'loading' });

    // Forgotten Memories tilesets (we use these as ground tiles).
    this.load.image('fm-tileset', '/sanctuary-v3/tilesets/forgotten-memories/tileset.png');
    this.load.image('fm-trees', '/sanctuary-v3/tilesets/forgotten-memories/trees_separated.png');
    this.load.image('fm-props', '/sanctuary-v3/tilesets/forgotten-memories/props.png');

    // Tilemap for the overworld (Tiled JSON).
    this.load.tilemapTiledJSON('overworld', '/sanctuary-v3/maps/overworld.json');

    // Buildings (8 themed exteriors, 128×128 each) + interiors (256×192 each).
    for (const id of BUILDING_IDS) {
      this.load.image(`building-v3-${id}`, `/sanctuary-v3/buildings/${id}.png`);
      this.load.image(`interior-v3-${id}`, `/sanctuary-v3/interiors/${id}.png`);
    }

    // SWO themed prop tiles (scattered decoration).
    const PROPS = [
      'signpost', 'cosmic-well', 'star-banner', 'moon-lantern', 'telescope',
      'floating-stone', 'rune-stone', 'training-dummy', 'star-flower',
      'seed-sprout', 'crystal-stove', 'dream-mushroom', 'star-chart',
      'crystal-anvil', 'forge-stone',
    ];
    for (const p of PROPS) {
      this.load.image(`prop-v3-${p}`, `/sanctuary-v3/props/${p}.png`);
    }

    // Decor extracted from props.png — trees, stumps, rock clusters.
    // Used for the world-perimeter forest + scattered ground decoration.
    const DECOR = [
      'tree-red', 'tree-blue', 'tree-yellow', 'tree-pine', 'tree-willow',
      'tree-orange-sm', 'tree-teal-sm',
      'stump-1', 'stump-2', 'stump-3',
      'rocks-1', 'rocks-2',
    ];
    for (const d of DECOR) {
      this.load.image(`decor-v3-${d}`, `/sanctuary-v3/decor/${d}.png`);
    }

    // Player sprite (48×48 4×4 sheet).
    PlayerSpriteV3.preload(this, '/sanctuary-v3/npcs/player-wanderer.png');

    // NPC sprites.
    for (const def of NPCS_V3) NPCSpriteV3.preload(this, def);

    // Companion constellation textures (cosmic-palette assets reused at V3
    // until FM-palette companion sheets are generated). Loading aether +
    // spectra matches V2 BootScene; other constellations lazy-load via
    // AnimationSystem.loadConstellationTextures on demand.
    AnimationSystem.preloadConstellations(this, ['aether', 'spectra']);
  }

  create() {
    PlayerSpriteV3.registerAnims(this);
    CompanionSprite.generatePlaceholderTexture(this);
    EventBus.emit('boot-progress', { phase: 'ready' });
    this.scene.start('WorldSceneV3');
  }
}
