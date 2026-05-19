// Persistence abstraction for the coinflip `bets` table.
//
// Two implementations:
//   - `inMemoryBetStore` — used by tests + the `dev --once` smoke harness.
//     Backs a Map keyed by betId; identical surface to the Ponder runtime
//     entity API so the handlers can target one abstraction.
//   - The Ponder context (provided at runtime via `context.db.Bet.create/update`)
//     is adapted by `ponderBetStore()` in src/index.ts.
//
// Schema-of-record: matches `schema.graphql` `Bet` entity.
// bigint fields are persisted as decimal strings — the GraphQL schema uses
// `BigInt` scalar (which Ponder serializes as a string).

import type { Address, Hex } from 'viem';

export type Side = 'heads' | 'tails';
export type BetStatus = 'pending' | 'won' | 'lost' | 'refunded';

export interface BetRow {
  betId: string;
  player: Address;
  side: Side;
  outcome: Side | null;
  stake: string;
  clientSeed: Hex;
  serverCommit: Hex;
  nonce: string;
  status: BetStatus;
  payout: string | null;
  serverReveal: Hex | null;
  blockPlaced: string;
  settledAt: string | null;
}

export interface BetStore {
  create(row: BetRow): Promise<void>;
  update(betId: string, patch: Partial<BetRow>): Promise<BetRow>;
  findByPlayer(player: Address, limit: number): Promise<BetRow[]>;
  get(betId: string): Promise<BetRow | null>;
  count(): Promise<number>;
}

export function sideFromUint(u: number | bigint): Side {
  const n = typeof u === 'bigint' ? Number(u) : u;
  return n === 0 ? 'heads' : 'tails';
}

export function inMemoryBetStore(): BetStore {
  const rows = new Map<string, BetRow>();
  return {
    async create(row) {
      if (rows.has(row.betId)) {
        throw new Error(`bet ${row.betId} already exists`);
      }
      rows.set(row.betId, { ...row });
    },
    async update(betId, patch) {
      const cur = rows.get(betId);
      if (!cur) throw new Error(`bet ${betId} not found`);
      const next: BetRow = { ...cur, ...patch };
      rows.set(betId, next);
      return next;
    },
    async findByPlayer(player, limit) {
      const lower = player.toLowerCase();
      const matches: BetRow[] = [];
      for (const row of rows.values()) {
        if (row.player.toLowerCase() === lower) matches.push(row);
      }
      matches.sort((a, b) => {
        const aBlk = BigInt(a.blockPlaced);
        const bBlk = BigInt(b.blockPlaced);
        if (aBlk !== bBlk) return aBlk > bBlk ? -1 : 1;
        return BigInt(b.betId) > BigInt(a.betId) ? 1 : -1;
      });
      return matches.slice(0, limit);
    },
    async get(betId) {
      return rows.get(betId) ?? null;
    },
    async count() {
      return rows.size;
    },
  };
}
