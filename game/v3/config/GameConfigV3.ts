import Phaser from 'phaser';
import { BootSceneV3 } from '../scenes/BootSceneV3';
import { WorldSceneV3 } from '../scenes/WorldSceneV3';

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
  scene: [BootSceneV3, WorldSceneV3],
  pixelArt: true,
  antialias: false,
  roundPixels: true,
};
