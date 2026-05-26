/**
 * Tests for the canonical Outer Rim Equipment catalog
 * [SWO_OUTER_RIM_EQUIPMENT_DATA_SCHEMA].
 *
 * Acceptance criteria asserted here:
 *  (a) 42 entries — 7 assets per slot x 6 slots.
 *  (b) every entry validates against equipment_items.schema.json.
 *  (c) the output<->survival tradeoff is visible in the stat distribution
 *      (no item maxes both Haul Rate and Stealth).
 *  (d) no item is dominant — no item Pareto-dominates another across all
 *      six stats.
 *
 * The validator is a self-contained Draft-07 subset (only the keywords the
 * schema uses) so the suite carries no dependency the package.json doesn't
 * already declare.
 */
import { describe, it, expect } from 'vitest';
import catalog from '@/data/outer-rim/equipment_items.json';
import schema from '@/data/outer-rim/equipment_items.schema.json';

type StatKey =
  | 'haul_rate'
  | 'detection_tolerance'
  | 'speed'
  | 'stealth'
  | 'bonus_chance'
  | 'bonus_multiplier';

const STAT_KEYS: StatKey[] = [
  'haul_rate',
  'detection_tolerance',
  'speed',
  'stealth',
  'bonus_chance',
  'bonus_multiplier',
];

const OUTPUT_STATS: StatKey[] = [
  'haul_rate',
  'speed',
  'bonus_chance',
  'bonus_multiplier',
];

const SLOTS = ['Vessel', 'Crew', 'Cloaking', 'Cargo', 'Quartermaster', 'CommsBlackout'];

interface EquipmentItem {
  item_key: string;
  name: string;
  slot: string;
  rarity: string;
  asset_key: string;
  lore: string;
  base_stats: Record<StatKey, number>;
}

const items = catalog.items as EquipmentItem[];

/** Draft-07 subset node — only the keywords the schema actually uses. */
interface SchemaNode {
  $ref?: string;
  type?: string;
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean;
  items?: SchemaNode;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
  definitions?: Record<string, SchemaNode>;
}

/**
 * Minimal recursive JSON-Schema (Draft-07 subset) validator. Returns a list
 * of human-readable error strings; empty list means the value is valid.
 * Supports: $ref (local), type, required, properties, additionalProperties:false,
 * items, enum, const, minimum, maximum, minLength, minItems, maxItems,
 * uniqueItems, pattern.
 */
function validate(value: unknown, node: SchemaNode, root: SchemaNode, path = '$'): string[] {
  const errors: string[] = [];

  if (node.$ref) {
    const ref = node.$ref.replace(/^#\//, '').split('/');
    let resolved: unknown = root;
    for (const seg of ref) resolved = (resolved as Record<string, unknown>)?.[seg];
    return validate(value, resolved as SchemaNode, root, path);
  }

  if (node.const !== undefined && value !== node.const) {
    errors.push(`${path}: expected const ${JSON.stringify(node.const)}, got ${JSON.stringify(value)}`);
  }

  if (node.enum && !node.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum ${JSON.stringify(node.enum)}`);
  }

  if (node.type) {
    const t = node.type;
    const ok =
      (t === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) ||
      (t === 'array' && Array.isArray(value)) ||
      (t === 'string' && typeof value === 'string') ||
      (t === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
      (t === 'number' && typeof value === 'number');
    if (!ok) {
      errors.push(`${path}: expected type ${t}, got ${Array.isArray(value) ? 'array' : typeof value}`);
      return errors; // further checks assume the type holds
    }
  }

  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) {
      errors.push(`${path}: shorter than minLength ${node.minLength}`);
    }
    if (node.pattern && !new RegExp(node.pattern).test(value)) {
      errors.push(`${path}: "${value}" fails pattern ${node.pattern}`);
    }
  }

  if (typeof value === 'number') {
    if (node.minimum !== undefined && value < node.minimum) {
      errors.push(`${path}: ${value} < minimum ${node.minimum}`);
    }
    if (node.maximum !== undefined && value > node.maximum) {
      errors.push(`${path}: ${value} > maximum ${node.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) {
      errors.push(`${path}: ${value.length} items < minItems ${node.minItems}`);
    }
    if (node.maxItems !== undefined && value.length > node.maxItems) {
      errors.push(`${path}: ${value.length} items > maxItems ${node.maxItems}`);
    }
    if (node.uniqueItems) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) errors.push(`${path}: items not unique`);
    }
    if (node.items) {
      const itemSchema = node.items;
      value.forEach((entry, i) => {
        errors.push(...validate(entry, itemSchema, root, `${path}[${i}]`));
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const req of node.required ?? []) {
      if (!(req in obj)) errors.push(`${path}: missing required property "${req}"`);
    }
    const props = node.properties ?? {};
    if (node.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
    for (const [key, subSchema] of Object.entries(props)) {
      if (key in obj) {
        errors.push(...validate(obj[key], subSchema, root, `${path}.${key}`));
      }
    }
  }

  return errors;
}

describe('Outer Rim equipment catalog — structure', () => {
  it('declares the canonical spec id and rarity multipliers', () => {
    expect(catalog.spec_id).toBe('SWO_OUTER_RIM_EQUIPMENT_DATA_SCHEMA');
    // Multipliers lifted verbatim from Offshore (ADR-003 SS3.4).
    expect(catalog.rarity_multipliers).toEqual({
      Common: 1,
      Rare: 1.5,
      Epic: 2.5,
      Legendary: 4.5,
      Mythic: 8,
    });
  });

  it('(a) has exactly 42 entries: 7 per slot x 6 slots', () => {
    expect(items).toHaveLength(42);
    for (const slot of SLOTS) {
      expect(items.filter((i) => i.slot === slot)).toHaveLength(7);
    }
  });

  it('uses unique item_keys', () => {
    const keys = items.map((i) => i.item_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every item carries an SWO-themed name + lore one-liner', () => {
    for (const item of items) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.lore.length).toBeGreaterThan(0);
    }
  });
});

describe('Outer Rim equipment catalog — schema', () => {
  const rootSchema = schema as unknown as SchemaNode;

  it('(b) the whole document validates against the schema', () => {
    expect(validate(catalog, rootSchema, rootSchema)).toEqual([]);
  });

  it('(b) every catalog row validates against the item schema', () => {
    const itemSchema = rootSchema.definitions!.equipmentItem;
    for (const item of items) {
      expect(validate(item, itemSchema, rootSchema)).toEqual([]);
    }
  });

  it('self-check: the validator rejects a malformed row', () => {
    const itemSchema = rootSchema.definitions!.equipmentItem;
    const bad = {
      ...items[0],
      base_stats: { ...items[0].base_stats, stealth: 95 }, // > 70 cap
    };
    expect(validate(bad, itemSchema, rootSchema).length).toBeGreaterThan(0);
  });
});

describe('Outer Rim equipment catalog — economy invariants', () => {
  const budget = catalog.stat_sum_budget as number;
  const sumOf = (item: EquipmentItem) =>
    STAT_KEYS.reduce((acc, k) => acc + item.base_stats[k], 0);

  it('every base block sits in the same band as the Common base budget', () => {
    // The Common base is a normalized 100-point budget; rarity multipliers
    // scale it at runtime. A tight band keeps every starter item on the
    // same power curve (acceptance (c) "same band as Offshore Common base").
    const BAND = { min: budget - 5, max: budget + 5 };
    for (const item of items) {
      const total = sumOf(item);
      expect(total).toBeGreaterThanOrEqual(BAND.min);
      expect(total).toBeLessThanOrEqual(BAND.max);
    }
  });

  it('respects the 70% Stealth cap', () => {
    for (const item of items) {
      expect(item.base_stats.stealth).toBeLessThanOrEqual(70);
    }
  });

  it('(c) no item maxes both Haul Rate and Stealth', () => {
    const maxHaul = Math.max(...items.map((i) => i.base_stats.haul_rate));
    const maxStealth = Math.max(...items.map((i) => i.base_stats.stealth));
    const topHaul = items.find((i) => i.base_stats.haul_rate === maxHaul)!;
    const topStealth = items.find((i) => i.base_stats.stealth === maxStealth)!;
    expect(topHaul.item_key).not.toBe(topStealth.item_key);
    // No item is simultaneously top-tier output AND top-tier survival.
    for (const item of items) {
      const bothMaxed =
        item.base_stats.haul_rate === maxHaul &&
        item.base_stats.stealth === maxStealth;
      expect(bothMaxed).toBe(false);
    }
  });

  it('(c) output and survival are negatively correlated across the catalog', () => {
    // Each item's output footprint should trade against its survival footprint.
    const output = items.map((i) =>
      OUTPUT_STATS.reduce((a, k) => a + i.base_stats[k], 0),
    );
    const survival = items.map(
      (i) => i.base_stats.detection_tolerance + i.base_stats.stealth,
    );
    const n = items.length;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const mo = mean(output);
    const ms = mean(survival);
    let cov = 0;
    for (let i = 0; i < n; i++) cov += (output[i] - mo) * (survival[i] - ms);
    expect(cov).toBeLessThan(0);
  });

  it('(d) no item Pareto-dominates another across all six stats', () => {
    const dominates = (a: EquipmentItem, b: EquipmentItem) => {
      let strictlyBetter = false;
      for (const k of STAT_KEYS) {
        if (a.base_stats[k] < b.base_stats[k]) return false;
        if (a.base_stats[k] > b.base_stats[k]) strictlyBetter = true;
      }
      return strictlyBetter;
    };
    for (const a of items) {
      for (const b of items) {
        if (a.item_key === b.item_key) continue;
        expect(
          dominates(a, b),
          `${a.item_key} dominates ${b.item_key}`,
        ).toBe(false);
      }
    }
  });

  it('(d) every item is therefore Pareto-optimal (on the frontier)', () => {
    const dominatedBy = (a: EquipmentItem) =>
      items.some((b) => {
        if (b.item_key === a.item_key) return false;
        let strictlyBetter = false;
        for (const k of STAT_KEYS) {
          if (b.base_stats[k] < a.base_stats[k]) return false;
          if (b.base_stats[k] > a.base_stats[k]) strictlyBetter = true;
        }
        return strictlyBetter;
      });
    for (const item of items) {
      expect(dominatedBy(item), `${item.item_key} is dominated`).toBe(false);
    }
  });
});
