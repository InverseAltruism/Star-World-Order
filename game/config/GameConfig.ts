import * as Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { WorldScene } from '../scenes/WorldScene';
import { RoomScene } from '../scenes/RoomScene';
import { StarCatchScene } from '../scenes/StarCatchScene';
import { MemoryMatchScene } from '../scenes/MemoryMatchScene';
import { StarConnectScene } from '../scenes/StarConnectScene';
import { ForgeHammerScene } from '../scenes/ForgeHammerScene';
import { CookingRhythmScene } from '../scenes/CookingRhythmScene';
import { DreamCatcherScene } from '../scenes/DreamCatcherScene';
import { LoreTriviaScene } from '../scenes/LoreTriviaScene';
import { DeslopPostFXPipeline, DESLOP_PIPELINE_KEY } from '../shaders/DeslopPostFX';

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1200,
  height: 900,
  parent: 'phaser-sanctuary',
  backgroundColor: '#0a0015',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    WorldScene,
    RoomScene,
    StarCatchScene,
    MemoryMatchScene,
    StarConnectScene,
    ForgeHammerScene,
    CookingRhythmScene,
    DreamCatcherScene,
    LoreTriviaScene,
  ],
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  pipeline: {
    [DESLOP_PIPELINE_KEY]: DeslopPostFXPipeline,
  } as unknown as Phaser.Types.Core.PipelineConfig,
};
