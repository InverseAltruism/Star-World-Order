// Minimal ABI for the SWO CasinoBankroll events the indexer cares about.
//
// CasinoBankroll is the single shared liquidity pool funding all Cosmic
// Casino game contracts. We index the events that materially affect
// bankroll health so /api/casino/health and the public treasury view can
// reconstruct cash-flow + circuit-breaker state from the indexer alone
// (no archive RPC required).
//
// Hand-curated to avoid pulling Foundry into the indexer build path; see
// CasinoCoinflip.ts for the rationale. Source contract:
// contracts/casino/src/CasinoBankroll.sol.

export const BANKROLL_EVENT_ABI = [
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GamePayout',
    inputs: [
      { name: 'game', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GameSettled',
    inputs: [
      { name: 'game', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CircuitBreakerTripped',
    inputs: [
      { name: 'windowStartBalance', type: 'uint256', indexed: false },
      { name: 'currentBalance', type: 'uint256', indexed: false },
      { name: 'maxDrawdown24hWei', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CircuitBreakerReset',
    inputs: [
      { name: 'currentBalance', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const;
