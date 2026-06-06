// Persistence abstraction for the `dice_bets` table.
//
// Same pattern as `bet-store.ts` (the coinflip equivalent): a small interface
// + an InMemory implementation used by tests + dev-once.
//
// Schema-of-record: `DiceBet` in `schema.graphql`.

import type { Address, Hex } from 'viem';

export type DiceBetStatus = 'pending' | 'won' | 'lost' | 'refunded';

export interface DiceBetRow {
  betId: string;
  player: Address;
  /** Win threshold (1-95). Player wins when roll < rollUnder. */
  rollUnder: number;
  /** Rolled face 1-100. Null while pending or on refund. */
  roll: number | null;
  stake: string;
  clientSeed: Hex;
  serverCommit: Hex;
  nonce: string;
  status: DiceBetStatus;
  payout: string | null;
  serverReveal: Hex | null;
  blockPlaced: string;
  settledAt: string | null;
}

export interface DiceBetStore {
  create(row: DiceBetRow): Promise<void>;
  update(betId: string, patch: Partial<DiceBetRow>): Promise<DiceBetRow>;
  findByPlayer(player: Address, limit: number): Promise<DiceBetRow[]>;
  get(betId: string): Promise<DiceBetRow | null>;
  count(): Promise<number>;
}

export function inMemoryDiceBetStore(): DiceBetStore {
  const rows = new Map<string, DiceBetRow>();
  return {
    async create(row) {
      if (rows.has(row.betId)) {
        throw new Error(`dice bet ${row.betId} already exists`);
      }
      rows.set(row.betId, { ...row });
    },
    async update(betId, patch) {
      const cur = rows.get(betId);
      if (!cur) throw new Error(`dice bet ${betId} not found`);
      const next: DiceBetRow = { ...cur, ...patch };
      rows.set(betId, next);
      return next;
    },
    async findByPlayer(player, limit) {
      const lower = player.toLowerCase();
      const matches: DiceBetRow[] = [];
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
