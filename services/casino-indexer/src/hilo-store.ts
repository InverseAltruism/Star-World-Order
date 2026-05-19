// Persistence abstractions for the HiLo `sessions` + `steps` tables.
//
// HiLo splits state across two entities: one mutable session row that
// tracks running state (currentCard, multiplier, status) and N append-only
// step rows. Both stores follow the same pattern as `bet-store.ts`.
//
// Schema-of-record: `HiLoSession` + `HiLoStep` in `schema.graphql`.

import type { Address, Hex } from 'viem';

export type HiLoStatus = 'open' | 'cashed' | 'refunded' | 'pushed' | 'lost';
export type HiLoDirection = 'higher' | 'lower';

export interface HiLoSessionRow {
  sessionId: string;
  player: Address;
  stake: string;
  clientSeed: Hex;
  serverCommit: Hex;
  initialCard: number;
  currentCard: number;
  nonce: string;
  status: HiLoStatus;
  /** 1e18-scaled running multiplier (matches the contract). */
  multiplier: string;
  finalMultiplier: string | null;
  payout: string | null;
  blockOpened: string;
  settledAt: string | null;
  stepCount: number;
}

export interface HiLoStepRow {
  /** Composite "<sessionId>-<stepIdx>" — primary key. */
  id: string;
  sessionId: string;
  stepIdx: number;
  player: Address;
  direction: HiLoDirection;
  prevCard: number;
  newCard: number;
  won: boolean;
  newMultiplier: string;
  serverReveal: Hex;
  nextCommit: Hex;
  blockNumber: string;
}

export interface HiLoSessionStore {
  create(row: HiLoSessionRow): Promise<void>;
  update(
    sessionId: string,
    patch: Partial<HiLoSessionRow>,
  ): Promise<HiLoSessionRow>;
  get(sessionId: string): Promise<HiLoSessionRow | null>;
  findByPlayer(player: Address, limit: number): Promise<HiLoSessionRow[]>;
  count(): Promise<number>;
}

export interface HiLoStepStore {
  append(row: HiLoStepRow): Promise<void>;
  findBySession(sessionId: string): Promise<HiLoStepRow[]>;
  count(): Promise<number>;
}

export function directionFromUint(u: number | bigint): HiLoDirection {
  const n = typeof u === 'bigint' ? Number(u) : u;
  return n === 0 ? 'higher' : 'lower';
}

export function inMemoryHiLoSessionStore(): HiLoSessionStore {
  const rows = new Map<string, HiLoSessionRow>();
  return {
    async create(row) {
      if (rows.has(row.sessionId)) {
        throw new Error(`hilo session ${row.sessionId} already exists`);
      }
      rows.set(row.sessionId, { ...row });
    },
    async update(sessionId, patch) {
      const cur = rows.get(sessionId);
      if (!cur) throw new Error(`hilo session ${sessionId} not found`);
      const next: HiLoSessionRow = { ...cur, ...patch };
      rows.set(sessionId, next);
      return next;
    },
    async get(sessionId) {
      return rows.get(sessionId) ?? null;
    },
    async findByPlayer(player, limit) {
      const lower = player.toLowerCase();
      const matches: HiLoSessionRow[] = [];
      for (const row of rows.values()) {
        if (row.player.toLowerCase() === lower) matches.push(row);
      }
      matches.sort((a, b) => {
        const aBlk = BigInt(a.blockOpened);
        const bBlk = BigInt(b.blockOpened);
        if (aBlk !== bBlk) return aBlk > bBlk ? -1 : 1;
        return BigInt(b.sessionId) > BigInt(a.sessionId) ? 1 : -1;
      });
      return matches.slice(0, limit);
    },
    async count() {
      return rows.size;
    },
  };
}

export function inMemoryHiLoStepStore(): HiLoStepStore {
  const rows = new Map<string, HiLoStepRow>();
  return {
    async append(row) {
      if (rows.has(row.id)) {
        throw new Error(`hilo step ${row.id} already exists`);
      }
      rows.set(row.id, { ...row });
    },
    async findBySession(sessionId) {
      const matches: HiLoStepRow[] = [];
      for (const row of rows.values()) {
        if (row.sessionId === sessionId) matches.push(row);
      }
      matches.sort((a, b) => a.stepIdx - b.stepIdx);
      return matches;
    },
    async count() {
      return rows.size;
    },
  };
}
