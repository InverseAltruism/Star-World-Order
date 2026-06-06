/**
 * Server-side loader for expedition definitions.
 *
 * Reads the three tier seeds under `data/sanctuary/expeditions/` and exposes
 * the merged catalog plus the per-tier `star_cost` charged at start. The cost
 * lives outside {@link ExpeditionDefinition} because the engine module is
 * intentionally currency-agnostic — the persistence layer wraps it.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { ExpeditionDefinition } from './expeditions';
import { validateExpeditionDefinition } from './expeditions';

export type ExpeditionTier = 'easy' | 'medium' | 'hard';

export const EXPEDITION_TIERS: readonly ExpeditionTier[] = ['easy', 'medium', 'hard'];

export interface ExpeditionCatalogEntry {
  tier: ExpeditionTier;
  star_cost: number;
  definition: ExpeditionDefinition;
}

let cachedCatalog: ExpeditionCatalogEntry[] | null = null;

interface SeedShape {
  tier?: string;
  expeditions: Array<ExpeditionDefinition & { star_cost?: number }>;
}

function loadTier(tier: ExpeditionTier): ExpeditionCatalogEntry[] {
  const filePath = path.join(process.cwd(), 'data', 'sanctuary', 'expeditions', `${tier}.json`);
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SeedShape;
  const out: ExpeditionCatalogEntry[] = [];
  for (const seed of raw.expeditions ?? []) {
    const { star_cost, ...def } = seed;
    const validation = validateExpeditionDefinition(def);
    if (!validation.ok) {
      throw new Error(
        `Invalid expedition seed ${tier}.json#${def.id}: ${validation.errors.join('; ')}`,
      );
    }
    out.push({
      tier,
      star_cost: typeof star_cost === 'number' && star_cost >= 0 ? Math.floor(star_cost) : 0,
      definition: def,
    });
  }
  return out;
}

export function getExpeditionCatalog(): ExpeditionCatalogEntry[] {
  if (cachedCatalog) return cachedCatalog;
  const entries: ExpeditionCatalogEntry[] = [];
  for (const tier of EXPEDITION_TIERS) {
    entries.push(...loadTier(tier));
  }
  cachedCatalog = entries;
  return entries;
}

export function getExpeditionCatalogEntry(expeditionId: string): ExpeditionCatalogEntry | null {
  return getExpeditionCatalog().find((e) => e.definition.id === expeditionId) ?? null;
}

/** Test-only escape hatch — clears the in-process cache. */
export function __resetExpeditionCatalogCache(): void {
  cachedCatalog = null;
}
