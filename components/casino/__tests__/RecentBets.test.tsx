// @vitest-environment happy-dom
//
// RecentBets — covers the acceptance contract for
// SWO_CASINO_COMPONENT_RECENT_BETS:
//   (a) component exists & renders
//   (b) renders empty-state copy with data-state="empty" when no bets
//       (default, and when `bets={[]}` is passed explicitly)
//   (c) renders one row per bet when fed mock indexer data
//
// The component lives inside the casino vitest project (see
// vitest.config.ts) and uses happy-dom + react-dom/client directly —
// the SWO repo doesn't ship `@testing-library/react`, so we follow
// the WalletSheet/BetPanel/TrustStrip pattern of driving renders
// through `createRoot` and querying the container.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  RecentBets,
  formatWei,
  outcomeChipKind,
  type RecentBet,
} from '../RecentBets';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const COINFLIP_WIN: RecentBet = {
  game: 'coinflip',
  betId: '1',
  stakeWei: '10000000000000000', // 0.01 MON
  payoutWei: '19800000000000000', // 0.0198 MON
  outcome: 'won',
  blockNumber: '100',
  txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

const DICE_LOSS: RecentBet = {
  game: 'dice',
  betId: '7',
  stakeWei: '5000000000000000', // 0.005 MON
  payoutWei: null,
  outcome: 'lost',
  blockNumber: '200',
  txHash: null,
};

const HILO_CASHED: RecentBet = {
  game: 'hilo',
  betId: '3',
  stakeWei: '20000000000000000', // 0.02 MON
  payoutWei: '33000000000000000', // 0.033 MON
  outcome: 'cashed',
  blockNumber: '300',
  txHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
};

describe('RecentBets — formatWei + outcomeChipKind helpers', () => {
  it('formats wei with sub-MON precision and trims trailing zeros', () => {
    expect(formatWei('10000000000000000')).toBe('0.01');
    expect(formatWei('19800000000000000')).toBe('0.0198');
    expect(formatWei('1000000000000000000')).toBe('1');
    expect(formatWei('0')).toBe('0');
  });

  it('derives outcome chip kind from status + payout', () => {
    expect(outcomeChipKind('won', '1')).toBe('won');
    expect(outcomeChipKind('cashed', '1')).toBe('won');
    expect(outcomeChipKind('lost', null)).toBe('lost');
    expect(outcomeChipKind('refunded', null)).toBe('refunded');
    expect(outcomeChipKind('pushed', null)).toBe('pushed');
  });
});

describe('<RecentBets> (acceptance: SWO_CASINO_COMPONENT_RECENT_BETS)', () => {
  // (a) Component exists & renders. With no props passed, the
  // indexer-not-yet-wired branch is exercised — this is the day-1
  // production surface until the indexer lands.
  it('(a) renders the component under components/casino/', () => {
    act(() => {
      root.render(<RecentBets />);
    });
    const section = container.querySelector('[data-testid="recent-bets"]');
    expect(section).not.toBeNull();
  });

  // (b) Empty-state with the exact `data-state="empty"` attribute called
  // out by the acceptance contract, and the documented "No recent bets
  // yet" copy. Asserted both with the default (no `bets` prop) and an
  // explicit empty array so a future regression that crashes on `[]`
  // surfaces here.
  it('(b) renders "No recent bets yet" with data-state="empty" when no bets', () => {
    act(() => {
      root.render(<RecentBets />);
    });
    const section = container.querySelector('[data-testid="recent-bets"]');
    expect(section).not.toBeNull();
    expect(section?.getAttribute('data-state')).toBe('empty');
    const status = container.querySelector('[data-testid="recent-bets-status"]');
    expect(status?.textContent).toBe('No recent bets yet');
    expect(
      container.querySelectorAll('[data-testid="recent-bet-row"]').length,
    ).toBe(0);
  });

  it('(b2) treats an explicit empty bets array as empty (same data-state + copy)', () => {
    act(() => {
      root.render(<RecentBets bets={[]} />);
    });
    const section = container.querySelector('[data-testid="recent-bets"]');
    expect(section?.getAttribute('data-state')).toBe('empty');
    const status = container.querySelector('[data-testid="recent-bets-status"]');
    expect(status?.textContent).toBe('No recent bets yet');
  });

  // (c) When mock indexer data is passed, renders one row per bet with
  // the per-row data-game / data-outcome contract the wallet sheet will
  // query against once the indexer lands.
  it('(c) renders one row per bet across all 3 games when fed mock indexer data', () => {
    act(() => {
      root.render(
        <RecentBets bets={[HILO_CASHED, DICE_LOSS, COINFLIP_WIN]} />,
      );
    });

    const section = container.querySelector('[data-testid="recent-bets"]');
    expect(section?.getAttribute('data-state')).toBe('populated');

    const rows = container.querySelectorAll('[data-testid="recent-bet-row"]');
    expect(rows.length).toBe(3);

    const games = Array.from(rows).map((r) => r.getAttribute('data-game'));
    expect(games).toEqual(['hilo', 'dice', 'coinflip']);

    const chipKinds = Array.from(
      container.querySelectorAll('[data-testid="recent-bet-outcome-chip"]'),
    ).map((c) => c.getAttribute('data-outcome'));
    expect(chipKinds).toEqual(['won', 'lost', 'won']);
  });

  it('(c2) formats stake → payout columns with the default MON symbol and 4dp', () => {
    act(() => {
      root.render(
        <RecentBets bets={[COINFLIP_WIN, HILO_CASHED, DICE_LOSS]} />,
      );
    });

    const stakes = Array.from(
      container.querySelectorAll('[data-testid="recent-bet-stake"]'),
    ).map((el) => el.textContent);
    expect(stakes[0]).toBe('0.01 MON');
    expect(stakes[1]).toBe('0.02 MON');
    expect(stakes[2]).toBe('0.005 MON');

    const payouts = Array.from(
      container.querySelectorAll('[data-testid="recent-bet-payout"]'),
    ).map((el) => el.textContent);
    expect(payouts[0]).toBe('0.0198 MON');
    expect(payouts[1]).toBe('0.033 MON');
    expect(payouts[2]).toBe('0 MON');
  });

  it('(c3) links each row\'s betId to /verify/[betId]', () => {
    act(() => {
      root.render(<RecentBets bets={[COINFLIP_WIN, DICE_LOSS]} />);
    });

    const links = container.querySelectorAll<HTMLAnchorElement>(
      '[data-testid="recent-bet-betid-link"]',
    );
    expect(links.length).toBe(2);
    expect(links[0]?.getAttribute('href')).toBe('/verify/1');
    expect(links[1]?.getAttribute('href')).toBe('/verify/7');
  });
});
