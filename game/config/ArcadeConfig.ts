// [SWO_V2_SANCTUARY_QUESTS_V2] Minimal Phaser config for the standalone arcade —
// just the seven minigame scenes, no WorldScene/RoomScene. The minigame scenes
// are fully self-contained (they draw everything procedurally and load no
// external assets), so they can run on their own canvas, launched directly from
// the Companion view's GAMES section without the (unreleased) full Phaser world.
import * as Phaser from 'phaser';
import { StarCatchScene } from '../scenes/StarCatchScene';
import { MemoryMatchScene } from '../scenes/MemoryMatchScene';
import { StarConnectScene } from '../scenes/StarConnectScene';
import { ForgeHammerScene } from '../scenes/ForgeHammerScene';
import { CookingRhythmScene } from '../scenes/CookingRhythmScene';
import { DreamCatcherScene } from '../scenes/DreamCatcherScene';
import { LoreTriviaScene } from '../scenes/LoreTriviaScene';

export const ARCADE_PARENT_ID = 'phaser-arcade';

// No `scene` here on purpose: Phaser auto-starts the first scene in the array
// (calling create() with no launch data → crash). The host adds these manually
// with autoStart=false and starts only the chosen one with proper launch data.
export const ARCADE_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1200,
  height: 900,
  parent: ARCADE_PARENT_ID,
  backgroundColor: '#0a0015',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  pixelArt: true,
  antialias: false,
  roundPixels: true,
};

/** Scenes to register on the arcade game (key → class), all autoStart=false. */
export const ARCADE_SCENES: { key: string; scene: new () => Phaser.Scene }[] = [
  { key: 'StarCatchScene', scene: StarCatchScene },
  { key: 'MemoryMatchScene', scene: MemoryMatchScene },
  { key: 'StarConnectScene', scene: StarConnectScene },
  { key: 'ForgeHammerScene', scene: ForgeHammerScene },
  { key: 'CookingRhythmScene', scene: CookingRhythmScene },
  { key: 'DreamCatcherScene', scene: DreamCatcherScene },
  { key: 'LoreTriviaScene', scene: LoreTriviaScene },
];

export interface ArcadeGameMeta {
  gameId: string;
  sceneKey: string;
  label: string;
  blurb: string;
  durationSeconds: number;
}

/** The arcade catalog (gameId → scene + display). Mirrors SANCTUARY_MINIGAMES. */
export const ARCADE_GAMES: ArcadeGameMeta[] = [
  { gameId: 'star-catch', sceneKey: 'StarCatchScene', label: 'Star Catch', blurb: 'Catch falling stars, dodge bombs.', durationSeconds: 60 },
  { gameId: 'memory-match', sceneKey: 'MemoryMatchScene', label: 'Mood Match', blurb: 'Flip tiles to match Skrumpey moods.', durationSeconds: 75 },
  { gameId: 'star-connect', sceneKey: 'StarConnectScene', label: 'Star Connect', blurb: 'Trace constellations in order.', durationSeconds: 70 },
  { gameId: 'forge-hammer', sceneKey: 'ForgeHammerScene', label: 'Forge Hammer', blurb: 'Time your strikes on the anvil.', durationSeconds: 60 },
  { gameId: 'cooking-rhythm', sceneKey: 'CookingRhythmScene', label: 'Cooking Rhythm', blurb: 'Hit the notes as they reach the pan.', durationSeconds: 70 },
  { gameId: 'dream-catcher', sceneKey: 'DreamCatcherScene', label: 'Dream Catcher', blurb: 'Scoop dreams, let nightmares pass.', durationSeconds: 75 },
  { gameId: 'lore-trivia', sceneKey: 'LoreTriviaScene', label: 'Lore Trivia', blurb: 'Answer Sanctuary lore questions.', durationSeconds: 75 },
];
