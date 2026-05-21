# `@swo/casino-indexer`

Ponder indexer for the Star World Order (SWO) Cosmic Casino contracts on
**Monad testnet** (chainId `10143`).

Ported from `mega-house/apps/indexer` and retargeted from MegaETH testnet to
Monad testnet. Handlers, stores, and the cross-game aggregator are pure
TypeScript so vitest can drive them without a live RPC or Ponder install.

## Layout

| Path               | Purpose                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `ponder.config.ts` | Network + contracts config. Reads chain id / RPC / addresses from env.     |
| `schema.graphql`   | Ponder entity schema (`Bet`, `DiceBet`, `HiLoSession`, `HiLoStep`).        |
| `abis/`            | Hand-curated event ABIs for the three indexed contracts.                   |
| `src/`             | Pure handlers + in-memory stores + Ponder context adapter (`index.ts`).    |
| `__tests__/`       | Vitest coverage for each game's handlers + cross-game aggregation + config. |

## Indexed contracts (events)

- **CasinoCoinflip** — `BetPlaced`, `BetSettled`, `BetRefunded`
- **CasinoDice** — `BetPlaced`, `BetSettled`, `BetRefunded`
- **CasinoHiLo** — `SessionOpened`, `StepPlayed`, `SessionCashedOut`,
  `SessionRefunded`, `SessionPushed`

A fourth contract (slots) is a planned follow-up — slots placement is still
out-of-protocol, so its handler set will land alongside the on-chain slots
contract.

## Environment

```
# Required for ponder dev on a non-default RPC
SWO_INDEXER_RPC_URL=https://testnet-rpc.monad.xyz     # or MONAD_TESTNET_RPC_URL
SWO_CHAIN_ID=10143                                     # default; override for anvil fork

# Deployed addresses — fall through to BUNNYBAGZ_* legacy aliases.
SWO_COINFLIP_ADDRESS=0x...
SWO_DICE_ADDRESS=0x...
SWO_HILO_ADDRESS=0x...

# Optional — speed up reindex on a fresh DB.
SWO_INDEXER_FROM_BLOCK=0
```

## Commands

```sh
# Run the indexer locally (requires `ponder` installed in this workspace).
npm run dev --workspace=@swo/casino-indexer

# Pure-handler vitest coverage — no RPC required.
npx vitest run services/casino-indexer/__tests__
```

## Hosting

Operator picks one of:

- **Ponder Cloud** — point `ponder.config.ts` at the deployed addresses, set
  the Monad testnet RPC, push.
- **Goldsky** — wrap the same handlers behind a Goldsky subgraph.
- **Self-host** — run `ponder start` on a Vercel cron / Fly machine.

The handlers are runtime-agnostic; only `ponder.config.ts` + the runtime
adapter in `src/index.ts` know about Ponder specifically.

## GraphQL consumers

The `RecentBets` component in `components/casino/RecentBets.tsx` is the
canonical consumer for the per-wallet ticker; the client adapter in
`lib/casino/recentBetsIndexer.ts` queries the Ponder GraphQL endpoint and
maps `RecentBet` rows into the `WalletBet` shape `RecentBets` accepts.

For React callers, `lib/casino/useRecentBets.ts` is the canonical hook —
pass `{ endpoint, player }` and feed the returned `bets` into
`<RecentBets bets={...} />`. The hook short-circuits to an empty list
when the endpoint or player is missing so the wallet sheet still renders
the empty-state pill during the pre-indexer window.
