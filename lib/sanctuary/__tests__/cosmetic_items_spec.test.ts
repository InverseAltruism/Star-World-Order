import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Validates the shared cosmetic catalog spec at data/sanctuary/cosmetic_items.json.
// This JSON is the source of truth consumed by:
//   - V2.x shop seed loader (lib/db.ts SANCTUARY_COSMETIC_SEED)
//   - V2 sprite generation (public/sanctuary/cosmetics/)
//   - V3 sprite generation (public/sanctuary-v3/cosmetics/)
// The schema currently allows hat/accessory/background/animation; floor + seasonal
// + epic are part of the V2.3 expansion (SWO_V2_3_SHOP_CATEGORY_EXPANSION).

interface SpecItem {
  item_key: string;
  name: string;
  category: string;
  rarity: string;
  star_cost: number;
  level_required: number;
  description: string;
  asset_key: string;
  pixel_art_spec: {
    dimensions: string;
    anchor: string;
    v2_palette: string[];
    v3_palette: string[];
    motif: string;
    notes: string;
  };
}

interface Spec {
  $schema_version: string;
  spec_id: string;
  description: string;
  categories: string[];
  rarities: string[];
  price_range_star: { min: number; max: number };
  level_range: { min: number; max: number };
  asset_paths: { v2_root: string; v3_root: string; v2_palette_ref: string; v3_palette_ref: string };
  sprite_dimensions: Record<string, string>;
  items: SpecItem[];
}

function loadSpec(): Spec {
  const file = path.join(process.cwd(), 'data', 'sanctuary', 'cosmetic_items.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Spec;
}

const EXPECTED_CATEGORY_COUNTS: Record<string, number> = {
  hat: 8,
  accessory: 6,
  background: 5,
  floor: 5,
  animation: 4,
  seasonal: 2,
};

describe('cosmetic_items.json spec — top-level shape', () => {
  const spec = loadSpec();

  it('declares the SWO_SHARED_COSMETIC_ITEM_DESIGN spec_id', () => {
    expect(spec.spec_id).toBe('SWO_SHARED_COSMETIC_ITEM_DESIGN');
  });

  it('declares the six expected categories', () => {
    expect([...spec.categories].sort()).toEqual(
      ['accessory', 'animation', 'background', 'floor', 'hat', 'seasonal'].sort(),
    );
  });

  it('declares four rarities including epic', () => {
    expect([...spec.rarities].sort()).toEqual(
      ['common', 'epic', 'rare', 'uncommon'].sort(),
    );
  });

  it('declares STAR price range 10-50 and level range 0-15', () => {
    expect(spec.price_range_star).toEqual({ min: 10, max: 50 });
    expect(spec.level_range).toEqual({ min: 0, max: 15 });
  });

  it('points at both V2 and V3 sprite roots', () => {
    expect(spec.asset_paths.v2_root).toBe('/sanctuary/cosmetics');
    expect(spec.asset_paths.v3_root).toBe('/sanctuary-v3/cosmetics');
  });
});

describe('cosmetic_items.json spec — item counts per category', () => {
  const spec = loadSpec();

  it('contains exactly 30 items', () => {
    expect(spec.items.length).toBe(30);
  });

  it.each(Object.entries(EXPECTED_CATEGORY_COUNTS))(
    'has %s items in the %s category',
    (category, count) => {
      const got = spec.items.filter((i) => i.category === category).length;
      expect(got).toBe(count);
    },
  );
});

describe('cosmetic_items.json spec — per-item invariants', () => {
  const spec = loadSpec();

  it('has unique item_keys', () => {
    const keys = spec.items.map((i) => i.item_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('asset_key matches item_key for every item', () => {
    for (const item of spec.items) {
      expect(item.asset_key).toBe(item.item_key);
    }
  });

  it('every item has star_cost in [10, 50]', () => {
    for (const item of spec.items) {
      expect(item.star_cost).toBeGreaterThanOrEqual(10);
      expect(item.star_cost).toBeLessThanOrEqual(50);
    }
  });

  it('every item has level_required in [0, 15]', () => {
    for (const item of spec.items) {
      expect(item.level_required).toBeGreaterThanOrEqual(0);
      expect(item.level_required).toBeLessThanOrEqual(15);
    }
  });

  it('every item has a category from the declared category list', () => {
    for (const item of spec.items) {
      expect(spec.categories).toContain(item.category);
    }
  });

  it('every item has a rarity from the declared rarity list', () => {
    for (const item of spec.items) {
      expect(spec.rarities).toContain(item.rarity);
    }
  });

  it('every item has a non-empty name and description', () => {
    for (const item of spec.items) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it('item_key uses category prefix matching its category (snake_case)', () => {
    const prefix: Record<string, string> = {
      hat: 'hat_',
      accessory: 'acc_',
      background: 'bg_',
      floor: 'floor_',
      animation: 'anim_',
      seasonal: 'seasonal_',
    };
    for (const item of spec.items) {
      expect(item.item_key).toMatch(new RegExp(`^${prefix[item.category]}`));
      expect(item.item_key).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('every item has both V2 and V3 pixel-art palette specs', () => {
    for (const item of spec.items) {
      // animation entries with no rendered sprite (e.g., transform-only) may
      // legitimately have empty palettes — validate the key is present either way.
      expect(item.pixel_art_spec).toBeDefined();
      expect(Array.isArray(item.pixel_art_spec.v2_palette)).toBe(true);
      expect(Array.isArray(item.pixel_art_spec.v3_palette)).toBe(true);
      expect(item.pixel_art_spec.dimensions.length).toBeGreaterThan(0);
      expect(item.pixel_art_spec.motif.length).toBeGreaterThan(0);
    }
  });
});

describe('cosmetic_items.json spec — economic balance', () => {
  const spec = loadSpec();

  it('price increases monotonically with rarity tier within each category', () => {
    const tier: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
    const byCategory = new Map<string, SpecItem[]>();
    for (const item of spec.items) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    for (const [, items] of byCategory) {
      const sorted = [...items].sort((a, b) => tier[a.rarity] - tier[b.rarity]);
      const minByTier = new Map<number, number>();
      for (const i of sorted) {
        const t = tier[i.rarity];
        const prev = minByTier.get(t);
        if (prev === undefined || i.star_cost < prev) minByTier.set(t, i.star_cost);
      }
      const tiers = [...minByTier.keys()].sort();
      for (let i = 1; i < tiers.length; i++) {
        expect(minByTier.get(tiers[i])!).toBeGreaterThanOrEqual(
          minByTier.get(tiers[i - 1])!,
        );
      }
    }
  });

  it('level_required does not decrease as rarity tier increases within each category', () => {
    const tier: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
    const byCategory = new Map<string, SpecItem[]>();
    for (const item of spec.items) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    for (const [, items] of byCategory) {
      const minByTier = new Map<number, number>();
      for (const i of items) {
        const t = tier[i.rarity];
        const prev = minByTier.get(t);
        if (prev === undefined || i.level_required < prev) minByTier.set(t, i.level_required);
      }
      const tiers = [...minByTier.keys()].sort();
      for (let i = 1; i < tiers.length; i++) {
        expect(minByTier.get(tiers[i])!).toBeGreaterThanOrEqual(
          minByTier.get(tiers[i - 1])!,
        );
      }
    }
  });
});
