import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { PlayerSpriteV3 } from '../sprites/PlayerSpriteV3';
import { NPCSpriteV3 } from '../sprites/NPCSpriteV3';
import { NPCS_V3 } from '../config/npcDefinitionsV3';
import { BUILDINGS } from '../config/worldLayoutV3';

export class BootSceneV3 extends Phaser.Scene {
  constructor() { super({ key: 'BootSceneV3' }); }

  preload() {
    EventBus.emit('boot-progress', { phase: 'loading' });

    // Forgotten Memories tilesets (we use these as ground tiles).
    this.load.image('fm-tileset', '/sanctuary-v3/tilesets/forgotten-memories/tileset.png');
    this.load.image('fm-trees', '/sanctuary-v3/tilesets/forgotten-memories/trees_separated.png');
    this.load.image('fm-props', '/sanctuary-v3/tilesets/forgotten-memories/props.png');
    this.load.image('fm-water', '/sanctuary-v3/tilesets/forgotten-memories/water_6frames.png');

    // Buildings (8 themed exteriors, 128×128 each).
    for (const b of BUILDINGS) {
      this.load.image(`building-v3-${b.id}`, `/sanctuary-v3/buildings/${b.id}.png`);
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

    // Player sprite (48×48 4×4 sheet).
    PlayerSpriteV3.preload(this, '/sanctuary-v3/npcs/player-wanderer.png');

    // NPC sprites.
    for (const def of NPCS_V3) NPCSpriteV3.preload(this, def);
  }

  create() {
    PlayerSpriteV3.registerAnims(this);
    EventBus.emit('boot-progress', { phase: 'ready' });
    this.scene.start('WorldSceneV3');
  }
}
