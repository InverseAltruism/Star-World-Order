import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { WorldScene } from '../scenes/WorldScene';
import { RoomScene } from '../scenes/RoomScene';
import { StarCatchScene } from '../scenes/StarCatchScene';
import { MemoryMatchScene } from '../scenes/MemoryMatchScene';
import { StarConnectScene } from '../scenes/StarConnectScene';
import { ForgeHammerScene } from '../scenes/ForgeHammerScene';

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
  ],
  pixelArt: true,
  antialias: false,
  roundPixels: true,
};
