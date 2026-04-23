import Phaser from 'phaser';
import type { Direction } from '../sprites/PlayerSprite';

export type CompanionMood = 'happy' | 'calm' | 'sleepy' | 'excited' | 'curious' | 'idle';
export type AnimState = 'idle' | 'walk';

export const CONSTELLATIONS = [
  'aether', 'spectra', 'solveil', 'nebulu', 'chroma',
  'rose', 'monflare', 'auracore', 'parallel', 'prime',
] as const;
export type Constellation = (typeof CONSTELLATIONS)[number];

const MOOD_LIST: CompanionMood[] = ['happy', 'calm', 'sleepy', 'excited', 'curious', 'idle'];

const IDLE_BOB_PERIOD = 2000;
const IDLE_BOB_AMPLITUDE = 1;

const WALK_FRAME_DURATION = 150;
const WALK_BOB_OFFSETS = [0, -1, 0, 1];

export interface SpriteSheetConfig {
  constellation: Constellation;
  path: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, {
    frames: number[];
    frameRate: number;
    repeat: number;
  }>;
}

export class AnimationSystem {
  private scene: Phaser.Scene;
  private state: AnimState = 'idle';
  private mood: CompanionMood = 'idle';
  private constellation: Constellation | null = null;
  private walkDirection: Direction = 'down';
  private loadedConstellations = new Set<string>();
  private sheetConstellations = new Set<string>();

  private stateTime = 0;
  private walkFrame = 0;
  private walkFrameTimer = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getTextureKey(): string {
    if (!this.constellation) return 'companion-placeholder';

    if (this.sheetConstellations.has(this.constellation)) {
      return `sheet-${this.constellation}`;
    }

    const key = `companion-${this.constellation}-${this.mood}`;
    if (this.scene.textures.exists(key)) return key;

    const idleKey = `companion-${this.constellation}-idle`;
    if (this.scene.textures.exists(idleKey)) return idleKey;

    return 'companion-placeholder';
  }

  getAnimationKey(): string | null {
    if (!this.constellation || !this.sheetConstellations.has(this.constellation)) {
      return null;
    }
    const dirSuffix = this.state === 'walk' ? `-${this.walkDirection}` : '';
    return `${this.constellation}-${this.mood}-${this.state}${dirSuffix}`;
  }

  getYOffset(deltaMs: number): number {
    this.stateTime += deltaMs;

    if (this.state === 'idle') {
      const phase = (this.stateTime % IDLE_BOB_PERIOD) / IDLE_BOB_PERIOD;
      return Math.round(Math.sin(phase * Math.PI * 2)) * IDLE_BOB_AMPLITUDE;
    }

    if (this.state === 'walk') {
      this.walkFrameTimer += deltaMs;
      if (this.walkFrameTimer >= WALK_FRAME_DURATION) {
        this.walkFrameTimer -= WALK_FRAME_DURATION;
        this.walkFrame = (this.walkFrame + 1) % 4;
      }
      return WALK_BOB_OFFSETS[this.walkFrame];
    }

    return 0;
  }

  setState(newState: AnimState): boolean {
    if (this.state === newState) return false;
    this.state = newState;
    this.stateTime = 0;
    this.walkFrame = 0;
    this.walkFrameTimer = 0;
    return true;
  }

  setMood(newMood: CompanionMood): boolean {
    if (this.mood === newMood) return false;
    this.mood = newMood;
    return true;
  }

  setWalkDirection(dir: Direction) {
    this.walkDirection = dir;
  }

  setConstellation(c: Constellation) {
    this.constellation = c;
  }

  getState(): AnimState {
    return this.state;
  }

  getMood(): CompanionMood {
    return this.mood;
  }

  getConstellation(): Constellation | null {
    return this.constellation;
  }

  loadConstellationTextures(constellation: Constellation): void {
    if (this.loadedConstellations.has(constellation)) return;

    for (const mood of MOOD_LIST) {
      const key = `companion-${constellation}-${mood}`;
      if (!this.scene.textures.exists(key)) {
        this.scene.load.image(key, `/sanctuary/companions/${constellation}/${mood}.png`);
      }
    }

    this.loadedConstellations.add(constellation);
  }

  loadSpriteSheet(config: SpriteSheetConfig): void {
    const sheetKey = `sheet-${config.constellation}`;

    if (!this.scene.textures.exists(sheetKey)) {
      this.scene.load.spritesheet(sheetKey, config.path, {
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
      });
    }

    this.scene.load.once('complete', () => {
      this.registerSheetAnimations(config);
    });
  }

  private registerSheetAnimations(config: SpriteSheetConfig) {
    const sheetKey = `sheet-${config.constellation}`;
    this.sheetConstellations.add(config.constellation);

    for (const [animKey, animDef] of Object.entries(config.animations)) {
      if (this.scene.anims.exists(animKey)) continue;

      this.scene.anims.create({
        key: animKey,
        frames: animDef.frames.map((frame) => ({ key: sheetKey, frame })),
        frameRate: animDef.frameRate,
        repeat: animDef.repeat,
      });
    }
  }

  isLoaded(constellation: Constellation): boolean {
    return this.loadedConstellations.has(constellation) || this.sheetConstellations.has(constellation);
  }

  hasSheetAnimations(): boolean {
    return this.constellation !== null && this.sheetConstellations.has(this.constellation);
  }

  startLoad(): Promise<void> {
    return new Promise((resolve) => {
      if (this.scene.load.list.size === 0 && this.scene.load.inflight.size === 0) {
        resolve();
        return;
      }
      this.scene.load.once('complete', () => resolve());
      this.scene.load.start();
    });
  }

  static preloadConstellations(
    scene: Phaser.Scene,
    constellations: Constellation[]
  ): void {
    for (const c of constellations) {
      for (const mood of MOOD_LIST) {
        const key = `companion-${c}-${mood}`;
        if (!scene.textures.exists(key)) {
          scene.load.image(key, `/sanctuary/companions/${c}/${mood}.png`);
        }
      }
    }
  }
}
