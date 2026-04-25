import Phaser from 'phaser';

// Slot taxonomy. Add new slots here when introducing new cosmetic categories.
export const COSMETIC_SLOTS = ['hat', 'accessory'] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export interface CosmeticSheetConfig {
  cosmeticId: string;
  slot: CosmeticSlot;
  path: string;
  frameWidth: number;
  frameHeight: number;
  // Anchor offset relative to the base sprite origin. Slot defaults are used if omitted.
  offsetX?: number;
  offsetY?: number;
}

export const DEFAULT_SLOT_OFFSETS: Record<CosmeticSlot, { x: number; y: number }> = {
  hat: { x: 0, y: -6 },
  accessory: { x: 0, y: 0 },
};

export const SLOT_DEPTH_DELTA: Record<CosmeticSlot, number> = {
  // Layer order above the companion base sprite. Larger value renders on top.
  accessory: 1,
  hat: 2,
};

export interface EquippedCosmetics {
  hat?: string | null;
  accessory?: string | null;
}

export type EquipChange = {
  slot: CosmeticSlot;
  previousId: string | null;
  cosmeticId: string | null;
};

/**
 * CosmeticSystem manages the equipped cosmetic slots for a companion and the
 * sprite-sheet textures backing each cosmetic. It does NOT own the rendered
 * Sprites — `CompanionSprite` consumes this system to drive its layer composition.
 */
export class CosmeticSystem {
  private scene: Phaser.Scene;
  private equipped: Record<CosmeticSlot, string | null> = { hat: null, accessory: null };
  private registeredSheets = new Map<string, CosmeticSheetConfig>();
  private loadedSheets = new Set<string>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Register a cosmetic sheet so it can be equipped later. Idempotent. */
  registerCosmetic(config: CosmeticSheetConfig): void {
    this.registeredSheets.set(config.cosmeticId, config);
  }

  hasCosmetic(cosmeticId: string): boolean {
    return this.registeredSheets.has(cosmeticId);
  }

  getCosmeticConfig(cosmeticId: string): CosmeticSheetConfig | null {
    return this.registeredSheets.get(cosmeticId) ?? null;
  }

  /** Texture key Phaser uses for a registered cosmetic sheet. */
  static textureKeyFor(cosmeticId: string): string {
    return `cosmetic-${cosmeticId}`;
  }

  /** Queue the cosmetic spritesheet for loading. Caller must call scene.load.start(). */
  loadCosmeticAssets(cosmeticId: string): boolean {
    const cfg = this.registeredSheets.get(cosmeticId);
    if (!cfg) return false;
    if (this.loadedSheets.has(cosmeticId)) return false;
    const key = CosmeticSystem.textureKeyFor(cosmeticId);
    if (this.scene.textures.exists(key)) {
      this.loadedSheets.add(cosmeticId);
      return false;
    }
    this.scene.load.spritesheet(key, cfg.path, {
      frameWidth: cfg.frameWidth,
      frameHeight: cfg.frameHeight,
    });
    this.loadedSheets.add(cosmeticId);
    return true;
  }

  isLoaded(cosmeticId: string): boolean {
    return this.loadedSheets.has(cosmeticId)
      || this.scene.textures.exists(CosmeticSystem.textureKeyFor(cosmeticId));
  }

  /** Equip a cosmetic in a slot. Returns the change that occurred (or null if no-op). */
  equip(slot: CosmeticSlot, cosmeticId: string): EquipChange | null {
    if (!this.registeredSheets.has(cosmeticId)) {
      return null;
    }
    const previous = this.equipped[slot];
    if (previous === cosmeticId) return null;
    this.equipped[slot] = cosmeticId;
    return { slot, previousId: previous, cosmeticId };
  }

  /** Unequip whatever is in the slot. Returns the change (or null if nothing was equipped). */
  unequip(slot: CosmeticSlot): EquipChange | null {
    const previous = this.equipped[slot];
    if (previous === null) return null;
    this.equipped[slot] = null;
    return { slot, previousId: previous, cosmeticId: null };
  }

  getEquipped(): EquippedCosmetics {
    return { hat: this.equipped.hat, accessory: this.equipped.accessory };
  }

  getEquippedSlot(slot: CosmeticSlot): string | null {
    return this.equipped[slot];
  }

  /** Apply a full equipped_cosmetics object (e.g. from API). Returns the diff of changes. */
  applyEquipped(equipped: EquippedCosmetics): EquipChange[] {
    const changes: EquipChange[] = [];
    for (const slot of COSMETIC_SLOTS) {
      const desired = equipped[slot] ?? null;
      const current = this.equipped[slot];
      if (current === desired) continue;
      if (desired === null) {
        const change = this.unequip(slot);
        if (change) changes.push(change);
      } else {
        const change = this.equip(slot, desired);
        if (change) changes.push(change);
      }
    }
    return changes;
  }

  /**
   * Parse the `equipped_cosmetics` JSON column shape and apply it. Tolerates
   * malformed input by ignoring it (the companion just stays bare).
   */
  applyEquippedJson(json: string | null | undefined): EquipChange[] {
    if (!json) return this.applyEquipped({ hat: null, accessory: null });
    try {
      const parsed = JSON.parse(json) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [];
      }
      const obj = parsed as Record<string, unknown>;
      const next: EquippedCosmetics = {};
      for (const slot of COSMETIC_SLOTS) {
        const value = obj[slot];
        next[slot] = typeof value === 'string' && value.length > 0 ? value : null;
      }
      return this.applyEquipped(next);
    } catch {
      return [];
    }
  }

  /** Compute the rendered offset for a cosmetic, falling back to slot defaults. */
  getOffset(cosmeticId: string): { x: number; y: number } {
    const cfg = this.registeredSheets.get(cosmeticId);
    if (!cfg) return { x: 0, y: 0 };
    const slotDefault = DEFAULT_SLOT_OFFSETS[cfg.slot];
    return {
      x: cfg.offsetX ?? slotDefault.x,
      y: cfg.offsetY ?? slotDefault.y,
    };
  }

  /** Serialize current equipment back to the storage shape the API expects. */
  toJson(): string {
    return JSON.stringify(this.equipped);
  }
}
