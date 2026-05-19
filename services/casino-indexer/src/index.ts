// Ponder runtime entry — wires the runtime-agnostic handlers in
// `src/handlers.ts` to Ponder's context.db.* entity API.
//
// At runtime (with Ponder installed), `ponder` exports the `ponder` object
// with `on(eventName, handler)`. We register one handler per event the ABI
// declares; each adapts Ponder's `event.args` shape into the typed args our
// pure handlers expect, and adapts `context.db.*` into the store abstraction.
//
// Until `ponder` is added to the workspace, this module is dormant — it only
// imports `ponder` lazily inside `bootstrap()` so vitest/`tsc --noEmit`
// against this file resolve cleanly without the runtime in node_modules.
//
// `bootstrapWithFixture()` is the test seam: pass an in-memory store and a
// synthetic event stream and verify rows land in the table. `scripts/dev-once.ts`
// uses exactly this entry point against a static fixture.

import type { Address, Hex } from 'viem';

import type { BetStore, BetRow } from './bet-store';
import { inMemoryBetStore } from './bet-store';
import {
  onBetPlaced,
  onBetSettled,
  onBetRefunded,
  type EventEnvelope,
  type PlacedArgs,
  type SettledArgs,
  type RefundedArgs,
} from './handlers';

// ---------------------------------------------------------------------------
// Mock RPC fixture (used by tests + `dev --once`).
// ---------------------------------------------------------------------------

export type MockEvent =
  | { kind: 'BetPlaced'; args: PlacedArgs; envelope: EventEnvelope }
  | { kind: 'BetSettled'; args: SettledArgs; envelope: EventEnvelope }
  | { kind: 'BetRefunded'; args: RefundedArgs; envelope: EventEnvelope };

export interface MockRpcFixture {
  /** Replay a deterministic event stream into the supplied BetStore. */
  drain(store: BetStore): Promise<void>;
  events: MockEvent[];
}

const ADDR_ALICE: Address = '0x000000000000000000000000000000000000A11C';
const ADDR_BOB: Address = '0x000000000000000000000000000000000000b0B0';
const SEED: Hex = ('0x' + 'ab'.repeat(32)) as Hex;
const COMMIT: Hex = ('0x' + '11'.repeat(32)) as Hex;
const REVEAL: Hex = ('0x' + 'ce'.repeat(32)) as Hex;

export function buildMockRpcFixture(): MockRpcFixture {
  const events: MockEvent[] = [
    {
      kind: 'BetPlaced',
      args: {
        betId: 1n,
        player: ADDR_ALICE,
        side: 0,
        stake: 1_000_000_000_000_000n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 0n,
        blockPlaced: 100n,
      },
      envelope: { blockNumber: 100n },
    },
    {
      kind: 'BetSettled',
      args: {
        betId: 1n,
        player: ADDR_ALICE,
        outcome: 0,
        won: true,
        payout: 1_960_000_000_000_000n,
        serverReveal: REVEAL,
      },
      envelope: { blockNumber: 102n },
    },
    {
      kind: 'BetPlaced',
      args: {
        betId: 2n,
        player: ADDR_ALICE,
        side: 1,
        stake: 2_000_000_000_000_000n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 1n,
        blockPlaced: 110n,
      },
      envelope: { blockNumber: 110n },
    },
    {
      kind: 'BetSettled',
      args: {
        betId: 2n,
        player: ADDR_ALICE,
        outcome: 0,
        won: false,
        payout: 0n,
        serverReveal: REVEAL,
      },
      envelope: { blockNumber: 112n },
    },
    {
      kind: 'BetPlaced',
      args: {
        betId: 3n,
        player: ADDR_BOB,
        side: 0,
        stake: 500_000_000_000_000n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 0n,
        blockPlaced: 120n,
      },
      envelope: { blockNumber: 120n },
    },
    {
      kind: 'BetRefunded',
      args: { betId: 3n, player: ADDR_BOB, stake: 500_000_000_000_000n },
      envelope: { blockNumber: 9999n },
    },
  ];

  return {
    events,
    async drain(store) {
      for (const ev of events) {
        if (ev.kind === 'BetPlaced') {
          await onBetPlaced(store, ev.args, ev.envelope);
        } else if (ev.kind === 'BetSettled') {
          await onBetSettled(store, ev.args, ev.envelope);
        } else {
          await onBetRefunded(store, ev.args, ev.envelope);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Ponder context adapter (lazy — only used when Ponder is installed).
// ---------------------------------------------------------------------------

export interface PonderEntityApi {
  create(args: { id: string; data: Omit<BetRow, 'betId'> }): Promise<BetRow>;
  update(args: { id: string; data: Partial<BetRow> }): Promise<BetRow>;
  findMany(args: {
    where?: { player?: string; status?: { in?: string[] } };
    limit?: number;
    orderBy?: { blockPlaced?: 'desc' | 'asc' };
  }): Promise<BetRow[]>;
  findUnique(args: { id: string }): Promise<BetRow | null>;
}

/**
 * Adapt the Ponder context entity API into the runtime-agnostic BetStore.
 * Lets `src/handlers.ts` stay pure while still feeding the production runtime.
 */
export function ponderBetStore(api: PonderEntityApi): BetStore {
  return {
    async create(row) {
      const { betId, ...rest } = row;
      await api.create({
        id: betId,
        data: { ...rest, betId } as Omit<BetRow, 'betId'>,
      });
    },
    async update(betId, patch) {
      return api.update({ id: betId, data: patch });
    },
    async findByPlayer(player, limit) {
      const rows = await api.findMany({
        where: { player: player.toLowerCase() },
        limit,
        orderBy: { blockPlaced: 'desc' },
      });
      return rows;
    },
    async get(betId) {
      return api.findUnique({ id: betId });
    },
    async count() {
      const rows = await api.findMany({ limit: 10_000 });
      return rows.length;
    },
  };
}

// ---------------------------------------------------------------------------
// `dev --once` smoke harness.
// ---------------------------------------------------------------------------

export async function bootstrapWithFixture(): Promise<{
  store: BetStore;
  fixture: MockRpcFixture;
}> {
  const store = inMemoryBetStore();
  const fixture = buildMockRpcFixture();
  await fixture.drain(store);
  return { store, fixture };
}
