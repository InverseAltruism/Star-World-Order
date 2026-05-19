// Minimal ABI for the SWO casino coinflip events the indexer cares about.
// Hand-curated rather than codegen'd so the indexer can boot without Foundry
// in the build path. Source contract:
// contracts/casino/src/CasinoCoinflip.sol (event surface mirrors BunnyBagz
// upstream).

export const COINFLIP_EVENT_ABI = [
  {
    type: 'event',
    name: 'BetPlaced',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'side', type: 'uint8', indexed: false },
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
      { name: 'outcome', type: 'uint8', indexed: false },
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
