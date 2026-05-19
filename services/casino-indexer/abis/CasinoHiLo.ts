// Minimal ABI for the SWO casino HiLo events the indexer cares about.
// Direction enum: 0 = Higher, 1 = Lower (mapped via `directionFromUint`).

export const HILO_EVENT_ABI = [
  {
    type: 'event',
    name: 'SessionOpened',
    inputs: [
      { name: 'sessionId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'stake', type: 'uint256', indexed: false },
      { name: 'clientSeed', type: 'bytes32', indexed: false },
      { name: 'serverCommit', type: 'bytes32', indexed: false },
      { name: 'initialCard', type: 'uint8', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
      { name: 'blockOpened', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'StepPlayed',
    inputs: [
      { name: 'sessionId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'direction', type: 'uint8', indexed: false },
      { name: 'prevCard', type: 'uint8', indexed: false },
      { name: 'newCard', type: 'uint8', indexed: false },
      { name: 'won', type: 'bool', indexed: false },
      { name: 'newMultiplier', type: 'uint256', indexed: false },
      { name: 'serverReveal', type: 'bytes32', indexed: false },
      { name: 'nextCommit', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SessionCashedOut',
    inputs: [
      { name: 'sessionId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'payout', type: 'uint256', indexed: false },
      { name: 'finalMultiplier', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SessionRefunded',
    inputs: [
      { name: 'sessionId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'stake', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SessionPushed',
    inputs: [
      { name: 'sessionId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'stake', type: 'uint256', indexed: false },
      { name: 'card', type: 'uint8', indexed: false },
      { name: 'multiplier', type: 'uint256', indexed: false },
    ],
  },
] as const;
