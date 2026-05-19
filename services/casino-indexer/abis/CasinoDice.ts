// Minimal ABI for the SWO casino dice events the indexer cares about.
// See CasinoCoinflip.ts for the codegen-vs-hand-curated rationale.

export const DICE_EVENT_ABI = [
  {
    type: 'event',
    name: 'BetPlaced',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'rollUnder', type: 'uint8', indexed: false },
      { name: 'stake', type: 'uint256', indexed: false },
      { name: 'clientSeed', type: 'bytes32', indexed: false },
      { name: 'serverCommit', type: 'bytes32', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
      { name: 'blockPlaced', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BetSettled',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'rollUnder', type: 'uint8', indexed: false },
      { name: 'roll', type: 'uint8', indexed: false },
      { name: 'won', type: 'bool', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
      { name: 'serverReveal', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BetRefunded',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'stake', type: 'uint256', indexed: false },
    ],
  },
] as const;
