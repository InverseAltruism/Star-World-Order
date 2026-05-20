/**
 * Cosmetic gacha pull engine (V2 §3.3 / §3.4).
 *
 * Pure, RNG-injectable picker so the same logic powers both the runtime API
 * (Math.random) and the deterministic 1000-pull simulation in tests.
 *
 * Design contract:
 *   - Every pull yields ≥1 cosmetic (no "empty" pull). When the intended
 *     rarity tier has no eligible items, we fall back to the other tier so
 *     the floor guarantee is honoured even with sparse catalogs.
 *   - Rare-tier roll fires at {@link GACHA_RARE_CHANCE} (2%, in the §3.4
 *     1–2% band). No premium pity.
 *   - "Rare tier" = rarity in {rare, legendary}; "common tier" = {common,
 *     uncommon}.
 *   - Eligibility = item not already owned by the wallet AND wallet meets
 *     `level_required`.
 */

import type { CosmeticRarity } from '@/lib/db';

/** STAR debited per pull. Matched against the cheapest direct-buy cost so
 *  pulling is a sidegrade, not a strict downgrade. */
export const GACHA_PULL_COST = 30;

/** Probability that any single pull rolls into the rare/legendary tier. */
export const GACHA_RARE_CHANCE = 0.02;

const RARE_TIER: ReadonlySet<CosmeticRarity> = new Set(['rare', 'legendary']);

export function isRareTier(r: CosmeticRarity): boolean {
  return RARE_TIER.has(r);
}

export interface GachaCandidate {
  item_key: string;
  rarity: CosmeticRarity;
  level_required: number;
}

export interface GachaPickResult {
  itemKey: string;
  rarity: CosmeticRarity;
  isRare: boolean;
  /** True when the intended tier was empty and we fell through to the
   *  other tier. Surfaced so the API/UI can flag soft-pity scenarios. */
  fellBackToOtherTier: boolean;
}

/**
 * Pick a gacha item from `candidates` using the supplied RNG. Returns null
 * iff there is *no* eligible item at all (caller should refund / refuse
 * to charge the wallet).
 */
export function pickGachaItem(
  candidates: readonly GachaCandidate[],
  walletLevel: number,
  rng: () => number,
): GachaPickResult | null {
  const eligible = candidates.filter((c) => c.level_required <= walletLevel);
  if (eligible.length === 0) return null;

  const wantRare = rng() < GACHA_RARE_CHANCE;
  const wantedTier = eligible.filter((c) =>
    wantRare ? RARE_TIER.has(c.rarity) : !RARE_TIER.has(c.rarity),
  );

  const fellBackToOtherTier = wantedTier.length === 0;
  const pool = fellBackToOtherTier ? eligible : wantedTier;

  const raw = rng();
  const idx = Math.min(Math.floor(raw * pool.length), pool.length - 1);
  const pick = pool[idx];

  return {
    itemKey: pick.item_key,
    rarity: pick.rarity,
    isRare: RARE_TIER.has(pick.rarity),
    fellBackToOtherTier,
  };
}

/**
 * Deterministic mulberry32 PRNG. Used by the simulation test so a fixed seed
 * always produces the same distribution.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GachaSimSummary {
  totalPulls: number;
  rareHits: number;
  rareRate: number;
  hitsByRarity: Record<CosmeticRarity, number>;
}

/**
 * Run `n` pulls against a fixed `candidates` pool with a seeded RNG. Items
 * are not removed between pulls — this is for distribution checks only,
 * not inventory walk-throughs.
 */
export function simulateGachaDistribution(
  candidates: readonly GachaCandidate[],
  walletLevel: number,
  n: number,
  seed: number,
): GachaSimSummary {
  const rng = mulberry32(seed);
  const hitsByRarity: Record<CosmeticRarity, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    legendary: 0,
  };
  let rareHits = 0;
  for (let i = 0; i < n; i++) {
    const pick = pickGachaItem(candidates, walletLevel, rng);
    if (!pick) continue;
    hitsByRarity[pick.rarity] += 1;
    if (pick.isRare) rareHits += 1;
  }
  return {
    totalPulls: n,
    rareHits,
    rareRate: n > 0 ? rareHits / n : 0,
    hitsByRarity,
  };
}
