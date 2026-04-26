import Phaser from 'phaser';
import { BootSceneV3 } from '../scenes/BootSceneV3';
import { WorldSceneV3 } from '../scenes/WorldSceneV3';
import { RoomSceneV3 } from '../scenes/RoomSceneV3';
// Minigame scenes are shared logic — V3 reuses the V2 implementations.
import { StarCatchScene } from '../../scenes/StarCatchScene';
import { MemoryMatchScene } from '../../scenes/MemoryMatchScene';
import { StarConnectScene } from '../../scenes/StarConnectScene';
import { ForgeHammerScene } from '../../scenes/ForgeHammerScene';
import { CookingRhythmScene } from '../../scenes/CookingRhythmScene';
import { DreamCatcherScene } from '../../scenes/DreamCatcherScene';
import { LoreTriviaScene } from '../../scenes/LoreTriviaScene';

export const GAME_CONFIG_V3: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1200,
  height: 900,
  parent: 'phaser-sanctuary-v3',
  backgroundColor: '#0a0015',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [
    BootSceneV3,
    WorldSceneV3,
    RoomSceneV3,
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
};
