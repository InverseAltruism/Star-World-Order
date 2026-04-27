import Phaser from 'phaser';
import type { Direction } from './PlayerSprite';
import { AnimationSystem, type CompanionMood, type Constellation, CONSTELLATIONS } from '../systems/AnimationSystem';
import {
  CosmeticSystem,
  COSMETIC_SLOTS,
  type CosmeticSlot,
  type EquippedCosmetics,
} from '../systems/CosmeticSystem';
import {
  deriveMoodFromStats,
  statMoodToAnimationMood,
  type MoodStatInput,
} from '@/lib/sanctuary/mood';

const VALID_MOODS: ReadonlyArray<CompanionMood> = ['happy', 'calm', 'sleepy', 'excited', 'curious', 'idle'];
function isCompanionMood(value: string): value is CompanionMood {
  return (VALID_MOODS as readonly string[]).includes(value);
}

function statsArePopulated(stats: MoodStatInput | null | undefined): stats is MoodStatInput {
  if (!stats) return false;
  return (
    Number.isFinite(stats.hunger) &&
    Number.isFinite(stats.happiness) &&
    Number.isFinite(stats.energy)
  );
}

const LERP_FACTOR = 0.15;
const FOLLOW_DISTANCE = 20;
const MOVEMENT_THRESHOLD = 0.1;

export type { Constellation };
export { CONSTELLATIONS };

/**
 * CompanionSprite is a Phaser Container holding a base Sprite and one Sprite per
 * cosmetic slot (hat, accessory). Cosmetic layers stay frame-locked to the base
 * by mirroring its frame on every animationupdate event. The container exposes
 * the existing CompanionSprite surface (followPlayer / setMood / setConstellation /
 * setAway / setNFTTexture) so callers don't need to know about the layered
 * internals.
 */
export class CompanionSprite extends Phaser.GameObjects.Container {
  private base: Phaser.GameObjects.Sprite;
  private cosmeticSprites: Partial<Record<CosmeticSlot, Phaser.GameObjects.Sprite>> = {};
  private cosmetics: CosmeticSystem;

  private followOffsetX = FOLLOW_DISTANCE;
  private followOffsetY = FOLLOW_DISTANCE / 2;
  private baseY = 0;
  private animSystem: AnimationSystem | null = null;
  private lastTime = 0;
  private prevTextureKey = '';
  private away = false;
  private zzzText: Phaser.GameObjects.Text | null = null;
  private cachedFlipX = false;

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey?: string) {
    super(scene, x, y);
    this.base = scene.add.sprite(0, 0, textureKey || 'companion-placeholder');
    this.add(this.base);
    this.setSize(this.base.width, this.base.height);
    scene.add.existing(this);
    this.setDepth(9);
    this.setScale(1.5);
    this.baseY = y;

    this.cosmetics = new CosmeticSystem(scene);

    // Frame sync: when base sprite advances its animation frame, cosmetic
    // layers snap to the matching frame index so they stay perfectly aligned.
    this.base.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.handleBaseAnimationUpdate, this);
  }

  /**
   * Overrides Container.setInteractive so that calling it without an explicit
   * hit area uses a rectangle centered on the base sprite (origin 0.5, 0.5).
   * Phaser's default Container hit-area auto-derivation places the rectangle
   * at (0, 0)–(width, height), which would not cover the centered base sprite.
   */
  setInteractive(
    hitArea?: Phaser.Types.Input.InputConfiguration | Phaser.Geom.Rectangle | unknown,
    callback?: Phaser.Types.Input.HitAreaCallback,
    dropZone?: boolean,
  ): this {
    if (hitArea === undefined || (typeof hitArea === 'object' && hitArea !== null && !('contains' in hitArea))) {
      const w = this.base.width || 16;
      const h = this.base.height || 16;
      const rect = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);
      const config = (hitArea ?? {}) as Phaser.Types.Input.InputConfiguration;
      return super.setInteractive(
        { ...config, hitArea: rect, hitAreaCallback: Phaser.Geom.Rectangle.Contains },
      );
    }
    return super.setInteractive(hitArea, callback, dropZone);
  }

  getCosmeticSystem(): CosmeticSystem {
    return this.cosmetics;
  }

  isAway(): boolean {
    return this.away;
  }

  setAway(away: boolean) {
    if (this.away === away) return;
    this.away = away;

    if (away) {
      this.setAlpha(0.45);
      this.applyTint(0x8899cc);
      if (this.animSystem) {
        this.animSystem.setMood('sleepy');
        this.refreshTexture();
      }
      if (!this.zzzText && this.scene) {
        this.zzzText = this.scene.add
          .text(this.x, this.y - 12, 'Zzz', {
            fontFamily: '"Pixelify Sans", monospace',
            fontSize: '6px',
            color: '#9966ff',
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5, 1)
          .setDepth(10);
      }
    } else {
      this.setAlpha(1);
      this.clearTintAll();
      if (this.zzzText) {
        this.zzzText.destroy();
        this.zzzText = null;
      }
    }
  }

  static loadConstellationAssets(scene: Phaser.Scene): void {
    for (const c of CONSTELLATIONS) {
      scene.load.image(`companion-${c}`, `/sanctuary/companions/${c}/idle.png`);
    }
  }

  static generatePlaceholderTexture(scene: Phaser.Scene) {
    if (scene.textures.exists('companion-placeholder')) return;

    const g = scene.make.graphics();

    g.fillStyle(0xff00ff, 1);
    g.fillCircle(8, 8, 5);

    g.fillStyle(0xff66ff, 1);
    g.fillCircle(7, 6, 2);

    g.fillStyle(0xffffff, 1);
    g.fillRect(6, 6, 2, 2);
    g.fillRect(10, 6, 2, 2);

    g.fillStyle(0x000000, 1);
    g.fillRect(7, 7, 1, 1);
    g.fillRect(11, 7, 1, 1);

    g.generateTexture('companion-placeholder', 16, 16);
    g.destroy();
  }

  setAnimationSystem(system: AnimationSystem) {
    this.animSystem = system;
  }

  setMood(mood: CompanionMood) {
    if (!this.animSystem) return;
    if (this.animSystem.setMood(mood)) {
      this.refreshTexture();
    }
  }

  /**
   * Update mood from a current vitality snapshot. Prefers stats-derived mood
   * (V2.4 companions); falls back to the supplied trait mood for legacy
   * companions whose stats have not yet been populated. The derived StatMood
   * is mapped to an existing CompanionMood animation — no new art.
   */
  setMoodFromStats(stats: MoodStatInput | null | undefined, traitMood: string | null | undefined) {
    if (!this.animSystem) return;
    let target: CompanionMood | null = null;
    if (statsArePopulated(stats)) {
      target = statMoodToAnimationMood(deriveMoodFromStats(stats));
    } else if (traitMood && isCompanionMood(traitMood)) {
      target = traitMood;
    }
    if (target) this.setMood(target);
  }

  async setConstellation(constellation: Constellation) {
    if (!this.animSystem) {
      const key = `companion-${constellation}`;
      if (this.scene.textures.exists(key)) {
        this.base.setTexture(key);
      }
      return;
    }

    this.animSystem.setConstellation(constellation);

    if (!this.animSystem.isLoaded(constellation)) {
      this.animSystem.loadConstellationTextures(constellation);
      await this.animSystem.startLoad();
    }

    this.refreshTexture();
  }

  /** Equip a cosmetic in the given slot. Idempotent. */
  equipCosmetic(slot: CosmeticSlot, cosmeticId: string): boolean {
    if (!this.cosmetics.hasCosmetic(cosmeticId)) {
      // Auto-load only if registered. Caller is expected to register sheets ahead of time.
      return false;
    }
    const change = this.cosmetics.equip(slot, cosmeticId);
    if (!change) return false;
    this.syncSlotSprite(slot);
    return true;
  }

  /** Unequip the cosmetic from a slot. */
  unequipCosmetic(slot: CosmeticSlot): boolean {
    const change = this.cosmetics.unequip(slot);
    if (!change) return false;
    this.removeSlotSprite(slot);
    return true;
  }

  /** Apply a full cosmetic loadout, e.g. from the API's `equipped_cosmetics` field. */
  applyEquippedCosmetics(equipped: EquippedCosmetics): void {
    const changes = this.cosmetics.applyEquipped(equipped);
    for (const change of changes) {
      if (change.cosmeticId) {
        this.syncSlotSprite(change.slot);
      } else {
        this.removeSlotSprite(change.slot);
      }
    }
  }

  applyEquippedCosmeticsJson(json: string | null | undefined): void {
    const changes = this.cosmetics.applyEquippedJson(json);
    for (const change of changes) {
      if (change.cosmeticId) {
        this.syncSlotSprite(change.slot);
      } else {
        this.removeSlotSprite(change.slot);
      }
    }
  }

  getEquippedCosmetics(): EquippedCosmetics {
    return this.cosmetics.getEquipped();
  }

  private syncSlotSprite(slot: CosmeticSlot) {
    const cosmeticId = this.cosmetics.getEquippedSlot(slot);
    if (!cosmeticId) {
      this.removeSlotSprite(slot);
      return;
    }
    const textureKey = CosmeticSystem.textureKeyFor(cosmeticId);
    if (!this.scene.textures.exists(textureKey)) {
      // Sheet not loaded yet — caller should load it then call again.
      this.removeSlotSprite(slot);
      return;
    }

    const offset = this.cosmetics.getOffset(cosmeticId);
    let sprite = this.cosmeticSprites[slot];
    if (!sprite) {
      sprite = this.scene.add.sprite(offset.x, offset.y, textureKey);
      sprite.setOrigin(this.base.originX, this.base.originY);
      this.cosmeticSprites[slot] = sprite;
      this.add(sprite);
    } else {
      sprite.setTexture(textureKey);
      sprite.setPosition(offset.x, offset.y);
    }
    sprite.setFlipX(this.cachedFlipX);
    sprite.setFrame(this.base.frame.name);
    // Container child render order is determined by list position, not depth.
    // Re-anchor to the top so the layer renders above the base sprite.
    this.bringToTop(sprite);
  }

  private removeSlotSprite(slot: CosmeticSlot) {
    const sprite = this.cosmeticSprites[slot];
    if (!sprite) return;
    this.remove(sprite, true);
    delete this.cosmeticSprites[slot];
  }

  private handleBaseAnimationUpdate = (
    _anim: Phaser.Animations.Animation,
    frame: Phaser.Animations.AnimationFrame,
  ) => {
    for (const slot of COSMETIC_SLOTS) {
      const sprite = this.cosmeticSprites[slot];
      if (!sprite) continue;
      // Only sync if the cosmetic sheet uses a frame index that exists. The
      // safest path is to set the frame by index when numeric.
      const fname = frame.frame.name;
      try {
        sprite.setFrame(fname);
      } catch {
        // Cosmetic sheet has fewer frames — fall back to first frame.
        sprite.setFrame(0);
      }
    }
  };

  private applyTint(color: number) {
    this.base.setTint(color);
    for (const slot of COSMETIC_SLOTS) {
      this.cosmeticSprites[slot]?.setTint(color);
    }
  }

  private clearTintAll() {
    this.base.clearTint();
    for (const slot of COSMETIC_SLOTS) {
      this.cosmeticSprites[slot]?.clearTint();
    }
  }

  private setFlipXAll(flip: boolean) {
    if (this.cachedFlipX === flip) return;
    this.cachedFlipX = flip;
    this.base.setFlipX(flip);
    for (const slot of COSMETIC_SLOTS) {
      this.cosmeticSprites[slot]?.setFlipX(flip);
    }
  }

  private refreshTexture() {
    if (!this.animSystem) return;

    const animKey = this.animSystem.getAnimationKey();
    if (animKey && this.scene.anims.exists(animKey)) {
      this.base.play(animKey, true);
      this.prevTextureKey = '';
      return;
    }

    const textureKey = this.animSystem.getTextureKey();
    if (textureKey !== this.prevTextureKey) {
      this.prevTextureKey = textureKey;
      this.base.setTexture(textureKey);
    }
  }

  followPlayer(playerX: number, playerY: number, playerDirection?: Direction) {
    const now = this.scene.time.now;
    const delta = this.lastTime ? Math.min(now - this.lastTime, 50) : 16;
    this.lastTime = now;

    let targetOffsetX = FOLLOW_DISTANCE;
    let targetOffsetY = FOLLOW_DISTANCE / 2;

    switch (playerDirection) {
      case 'left':
        targetOffsetX = FOLLOW_DISTANCE;
        targetOffsetY = 0;
        break;
      case 'right':
        targetOffsetX = -FOLLOW_DISTANCE;
        targetOffsetY = 0;
        break;
      case 'up':
        targetOffsetX = FOLLOW_DISTANCE / 2;
        targetOffsetY = FOLLOW_DISTANCE;
        break;
      case 'down':
        targetOffsetX = FOLLOW_DISTANCE / 2;
        targetOffsetY = -FOLLOW_DISTANCE;
        break;
    }

    this.followOffsetX += (targetOffsetX - this.followOffsetX) * 0.05;
    this.followOffsetY += (targetOffsetY - this.followOffsetY) * 0.05;

    const targetX = playerX + this.followOffsetX;
    const targetY = playerY + this.followOffsetY;

    const prevX = this.x;
    const prevBaseY = this.baseY;

    this.x += (targetX - this.x) * LERP_FACTOR;
    this.baseY += (targetY - this.baseY) * LERP_FACTOR;

    const dx = this.x - prevX;
    const dy = this.baseY - prevBaseY;
    const isMoving = Math.abs(dx) > MOVEMENT_THRESHOLD || Math.abs(dy) > MOVEMENT_THRESHOLD;

    if (this.animSystem) {
      const stateChanged = this.animSystem.setState(isMoving ? 'walk' : 'idle');

      if (isMoving && playerDirection) {
        this.animSystem.setWalkDirection(playerDirection);
      }

      const yOffset = this.animSystem.getYOffset(delta);
      this.y = this.baseY + yOffset;

      if (stateChanged) {
        this.refreshTexture();
      }
    } else {
      this.y = this.baseY + Math.sin(now * 0.003) * 0.3;
    }

    if (playerDirection === 'left') {
      this.setFlipXAll(true);
    } else if (playerDirection === 'right') {
      this.setFlipXAll(false);
    }

    if (this.zzzText) {
      const bob = Math.sin(now * 0.004) * 1.5;
      this.zzzText.setPosition(this.x, this.y - 14 + bob);
    }
  }

  destroy(fromScene?: boolean): void {
    this.base?.off(Phaser.Animations.Events.ANIMATION_UPDATE, this.handleBaseAnimationUpdate, this);
    if (this.zzzText) {
      this.zzzText.destroy();
      this.zzzText = null;
    }
    super.destroy(fromScene);
  }

  setNFTTexture(url: string) {
    const key = 'companion-nft';
    if (this.scene.textures.exists(key)) {
      this.base.setTexture(key);
      return;
    }

    this.scene.load.image(key, url);
    this.scene.load.once('complete', () => {
      if (this.scene.textures.exists(key)) {
        this.base.setTexture(key);
      }
    });
    this.scene.load.start();
  }
}
