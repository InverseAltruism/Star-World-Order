import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import {
  CosmeticSystem,
  COSMETIC_SLOTS,
  DEFAULT_SLOT_OFFSETS,
  SLOT_DEPTH_DELTA,
  type CosmeticSheetConfig,
} from '../systems/CosmeticSystem';

// Minimal Phaser.Scene stub. CosmeticSystem only touches `textures.exists`,
// `load.spritesheet`, and stores the reference; the data-flow logic is fully
// testable without booting Phaser.
function makeScene() {
  const existing = new Set<string>();
  const loadCalls: { key: string; path: string; frameWidth: number; frameHeight: number }[] = [];
  return {
    scene: {
      textures: { exists: (key: string) => existing.has(key) },
      load: {
        spritesheet: vi.fn((key: string, path: string, cfg: { frameWidth: number; frameHeight: number }) => {
          loadCalls.push({ key, path, ...cfg });
        }),
      },
    } as unknown as import('phaser').Scene,
    existing,
    loadCalls,
  };
}

const HAT_CFG: CosmeticSheetConfig = {
  cosmeticId: 'witch_hat',
  slot: 'hat',
  path: '/sanctuary/cosmetics/witch_hat.png',
  frameWidth: 16,
  frameHeight: 16,
};

const ACCESSORY_CFG: CosmeticSheetConfig = {
  cosmeticId: 'star_pendant',
  slot: 'accessory',
  path: '/sanctuary/cosmetics/star_pendant.png',
  frameWidth: 16,
  frameHeight: 16,
  offsetY: 4,
};

describe('CosmeticSystem — slot taxonomy', () => {
  it('declares hat and accessory slots', () => {
    expect(COSMETIC_SLOTS).toEqual(['hat', 'accessory']);
  });

  it('layers hats above accessories (greater depth delta)', () => {
    expect(SLOT_DEPTH_DELTA.hat).toBeGreaterThan(SLOT_DEPTH_DELTA.accessory);
  });

  it('hat has a default upward offset so it sits above the head', () => {
    expect(DEFAULT_SLOT_OFFSETS.hat.y).toBeLessThan(0);
  });
});

describe('CosmeticSystem — equip / unequip', () => {
  let cs: CosmeticSystem;
  let helpers: ReturnType<typeof makeScene>;

  beforeEach(() => {
    helpers = makeScene();
    cs = new CosmeticSystem(helpers.scene);
    cs.registerCosmetic(HAT_CFG);
    cs.registerCosmetic(ACCESSORY_CFG);
  });

  it('starts with no equipment', () => {
    expect(cs.getEquipped()).toEqual({ hat: null, accessory: null });
  });

  it('equips a registered cosmetic and reports the change', () => {
    const change = cs.equip('hat', 'witch_hat');
    expect(change).toEqual({ slot: 'hat', previousId: null, cosmeticId: 'witch_hat' });
    expect(cs.getEquippedSlot('hat')).toBe('witch_hat');
  });

  it('returns null when equipping the same cosmetic twice (idempotent)', () => {
    cs.equip('hat', 'witch_hat');
    expect(cs.equip('hat', 'witch_hat')).toBeNull();
  });

  it('refuses to equip an unregistered cosmetic', () => {
    expect(cs.equip('hat', 'unknown_hat')).toBeNull();
    expect(cs.getEquippedSlot('hat')).toBeNull();
  });

  it('reports the previous id when swapping cosmetics in the same slot', () => {
    cs.equip('hat', 'witch_hat');
    cs.registerCosmetic({ ...HAT_CFG, cosmeticId: 'crown' });
    const change = cs.equip('hat', 'crown');
    expect(change).toEqual({ slot: 'hat', previousId: 'witch_hat', cosmeticId: 'crown' });
  });

  it('unequips and reports the change', () => {
    cs.equip('accessory', 'star_pendant');
    const change = cs.unequip('accessory');
    expect(change).toEqual({ slot: 'accessory', previousId: 'star_pendant', cosmeticId: null });
    expect(cs.getEquippedSlot('accessory')).toBeNull();
  });

  it('returns null when unequipping an empty slot', () => {
    expect(cs.unequip('hat')).toBeNull();
  });
});

describe('CosmeticSystem — applyEquipped (bulk update)', () => {
  let cs: CosmeticSystem;

  beforeEach(() => {
    cs = new CosmeticSystem(makeScene().scene);
    cs.registerCosmetic(HAT_CFG);
    cs.registerCosmetic(ACCESSORY_CFG);
  });

  it('applies a full loadout and emits one change per slot', () => {
    const changes = cs.applyEquipped({ hat: 'witch_hat', accessory: 'star_pendant' });
    expect(changes).toHaveLength(2);
    expect(cs.getEquipped()).toEqual({ hat: 'witch_hat', accessory: 'star_pendant' });
  });

  it('only emits changes for slots that actually moved', () => {
    cs.applyEquipped({ hat: 'witch_hat' });
    const changes = cs.applyEquipped({ hat: 'witch_hat', accessory: 'star_pendant' });
    expect(changes).toHaveLength(1);
    expect(changes[0].slot).toBe('accessory');
  });

  it('clears slots that are absent from the next loadout', () => {
    cs.applyEquipped({ hat: 'witch_hat', accessory: 'star_pendant' });
    const changes = cs.applyEquipped({ hat: 'witch_hat', accessory: null });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ slot: 'accessory', previousId: 'star_pendant', cosmeticId: null });
    expect(cs.getEquipped()).toEqual({ hat: 'witch_hat', accessory: null });
  });
});

describe('CosmeticSystem — JSON parsing (matches DB equipped_cosmetics column)', () => {
  let cs: CosmeticSystem;

  beforeEach(() => {
    cs = new CosmeticSystem(makeScene().scene);
    cs.registerCosmetic(HAT_CFG);
    cs.registerCosmetic(ACCESSORY_CFG);
  });

  it('applies a serialized loadout from the API', () => {
    cs.applyEquippedJson('{"hat":"witch_hat","accessory":"star_pendant"}');
    expect(cs.getEquipped()).toEqual({ hat: 'witch_hat', accessory: 'star_pendant' });
  });

  it('treats null or empty JSON as fully unequipped', () => {
    cs.applyEquipped({ hat: 'witch_hat' });
    cs.applyEquippedJson(null);
    expect(cs.getEquipped()).toEqual({ hat: null, accessory: null });
  });

  it('ignores malformed JSON without throwing', () => {
    expect(() => cs.applyEquippedJson('{not json')).not.toThrow();
    expect(cs.getEquipped()).toEqual({ hat: null, accessory: null });
  });

  it('ignores non-object JSON shapes', () => {
    cs.applyEquippedJson('[]');
    cs.applyEquippedJson('"witch_hat"');
    expect(cs.getEquipped()).toEqual({ hat: null, accessory: null });
  });

  it('round-trips through toJson()', () => {
    cs.applyEquipped({ hat: 'witch_hat', accessory: 'star_pendant' });
    const json = cs.toJson();
    const cs2 = new CosmeticSystem(makeScene().scene);
    cs2.registerCosmetic(HAT_CFG);
    cs2.registerCosmetic(ACCESSORY_CFG);
    cs2.applyEquippedJson(json);
    expect(cs2.getEquipped()).toEqual(cs.getEquipped());
  });
});

describe('CosmeticSystem — sheet loading', () => {
  it('queues the spritesheet onto the scene loader', () => {
    const helpers = makeScene();
    const cs = new CosmeticSystem(helpers.scene);
    cs.registerCosmetic(HAT_CFG);
    expect(cs.loadCosmeticAssets('witch_hat')).toBe(true);
    expect(helpers.loadCalls).toHaveLength(1);
    expect(helpers.loadCalls[0]).toMatchObject({
      key: 'cosmetic-witch_hat',
      path: HAT_CFG.path,
      frameWidth: 16,
      frameHeight: 16,
    });
  });

  it('skips queuing if the texture is already present in the scene', () => {
    const helpers = makeScene();
    helpers.existing.add('cosmetic-witch_hat');
    const cs = new CosmeticSystem(helpers.scene);
    cs.registerCosmetic(HAT_CFG);
    expect(cs.loadCosmeticAssets('witch_hat')).toBe(false);
    expect(helpers.loadCalls).toHaveLength(0);
    expect(cs.isLoaded('witch_hat')).toBe(true);
  });

  it('does not double-queue the same cosmetic', () => {
    const helpers = makeScene();
    const cs = new CosmeticSystem(helpers.scene);
    cs.registerCosmetic(HAT_CFG);
    cs.loadCosmeticAssets('witch_hat');
    expect(cs.loadCosmeticAssets('witch_hat')).toBe(false);
    expect(helpers.loadCalls).toHaveLength(1);
  });

  it('returns false for unregistered cosmetics', () => {
    const helpers = makeScene();
    const cs = new CosmeticSystem(helpers.scene);
    expect(cs.loadCosmeticAssets('mystery')).toBe(false);
  });
});

describe('CosmeticSystem — offsets fall back to slot defaults', () => {
  it('uses slot default when sheet has no explicit offset', () => {
    const cs = new CosmeticSystem(makeScene().scene);
    cs.registerCosmetic(HAT_CFG);
    expect(cs.getOffset('witch_hat')).toEqual(DEFAULT_SLOT_OFFSETS.hat);
  });

  it('uses sheet override when provided', () => {
    const cs = new CosmeticSystem(makeScene().scene);
    cs.registerCosmetic(ACCESSORY_CFG);
    expect(cs.getOffset('star_pendant').y).toBe(4);
  });
});

describe('CompanionSprite source — wires CosmeticSystem and EventBus', () => {
  // Source-level smoke test mirrors the pattern used in roomScene.test.ts:
  // we keep these guarantees that the layered renderer is actually present.
  const compSource = fs.readFileSync(
    new URL('../sprites/CompanionSprite.ts', import.meta.url),
    'utf-8',
  );
  const worldSource = fs.readFileSync(
    new URL('../scenes/WorldScene.ts', import.meta.url),
    'utf-8',
  );

  it('CompanionSprite extends Phaser.GameObjects.Container', () => {
    expect(compSource).toContain('extends Phaser.GameObjects.Container');
  });

  it('CompanionSprite owns a CosmeticSystem instance', () => {
    expect(compSource).toContain('new CosmeticSystem(scene)');
  });

  it('CompanionSprite syncs cosmetic frames on base animation update', () => {
    expect(compSource).toContain('Phaser.Animations.Events.ANIMATION_UPDATE');
  });

  it('WorldScene listens for equip / unequip / cosmetics on EventBus', () => {
    expect(worldSource).toContain("'companion-equip-cosmetic'");
    expect(worldSource).toContain("'companion-unequip-cosmetic'");
    expect(worldSource).toContain("'companion-cosmetics'");
  });
});
