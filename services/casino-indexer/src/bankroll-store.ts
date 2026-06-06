// Persistence abstraction for the bankroll event log.
//
// Unlike the game tables (one row per bet, updated on settle), the bankroll
// table is append-only: every event is a row. This keeps the schema simple
// (no state machine to reconcile) and lets the public treasury view do its
// own roll-up at query time.
//
// Schema-of-record: `BankrollEvent` in `schema.graphql`.

import type { Address } from 'viem';

export type BankrollEventKind =
  | 'deposit'
  | 'withdraw'
  | 'gamePayout'
  | 'gameSettled'
  | 'circuitBreakerTripped'
  | 'circuitBreakerReset';

export interface BankrollEventRow {
  /** Composite id: "<txHash>-<logIndex>" — keeps the row idempotent under reorgs. */
  id: string;
  kind: BankrollEventKind;
  /** Counterparty address (depositor / withdrawer / game / recipient). May be zero for breaker events. */
  counterparty: Address | null;
  /** For GamePayout, the player who received the funds (game is `counterparty`). */
  recipient: Address | null;
  /** Wei delta for cash-flow events; 0 for breaker rows. */
  amount: string;
  /** Block number the log was mined in. */
  blockNumber: string;
  /** Unix timestamp captured from the log envelope (or breaker event payload). */
  timestamp: string;
  /** Originating transaction hash for explorer cross-reference. */
  txHash: string;
}

export interface BankrollStore {
  create(row: BankrollEventRow): Promise<void>;
  list(limit: number): Promise<BankrollEventRow[]>;
  get(id: string): Promise<BankrollEventRow | null>;
  count(): Promise<number>;
}

export function inMemoryBankrollStore(): BankrollStore {
  const rows = new Map<string, BankrollEventRow>();
  return {
    async create(row) {
      // Idempotent on (txHash, logIndex): re-running the indexer on a reorg
      // should not duplicate rows. Last write wins on the same composite id.
      rows.set(row.id, { ...row });
    },
    async list(limit) {
      const all = Array.from(rows.values());
      all.sort((a, b) => {
        const aBlk = BigInt(a.blockNumber);
        const bBlk = BigInt(b.blockNumber);
        if (aBlk !== bBlk) return aBlk > bBlk ? -1 : 1;
        return a.id < b.id ? 1 : -1;
      });
      return all.slice(0, limit);
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async count() {
      return rows.size;
    },
  };
}
