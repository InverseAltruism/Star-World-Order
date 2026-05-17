// @vitest-environment happy-dom
//
// RecentBets — acceptance contract for SWO_CASINO_COMPONENT_RECENT_BETS:
//   (a) component exists & renders the graceful empty-state pill
//       (`data-state="empty"`, "No recent bets yet") until the indexer
//       lands
//   (b) when fed mock indexer rows it renders one row per bet with the
//       game label, outcome chip, stake/payout, verify-link, and
//       (optional) explorer link
//
// Pure parent-fed component for now — no fetcher to mock.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  RecentBets,
  formatWei,
  outcomeChipKind,
  type WalletBet,
} from '../RecentBets';

// React 19's act(...) checks for this flag and warns otherwise.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const COINFLIP_WIN: WalletBet = {
  game: 'coinflip',
  betId: '1',
  stakeWei: '10000000000000000', // 0.01
  payoutWei: '19800000000000000', // 0.0198
  outcome: 'won',
  blockNumber: '100',
  txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

const DICE_LOSS: WalletBet = {
  game: 'dice',
  betId: '7',
  stakeWei: '5000000000000000', // 0.005
  payoutWei: null,
  outcome: 'lost',
  blockNumber: '200',
  txHash: null,
};

const HILO_CASHED: WalletBet = {
  game: 'hilo',
  betId: '3',
  stakeWei: '20000000000000000', // 0.02
  payoutWei: '33000000000000000', // 0.033
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
  // (a) Component exists and renders the graceful empty state.
  it('(a) renders "No recent bets yet" with data-state="empty" when no bets given', () => {
    act(() => {
      root.render(<RecentBets />);
    });
    const section = container.querySelector('[data-testid="swo-recent-bets"]');
    expect(section).not.toBeNull();
    expect(section!.getAttribute('data-state')).toBe('empty');
    expect(section!.getAttribute('aria-label')).toBe('Recent bets');
    const status = container.querySelector(
      '[data-testid="swo-recent-bets-status"]',
    );
    expect(status!.textContent).toBe('No recent bets yet');
    // No rows in the empty surface.
    expect(
      container.querySelectorAll('[data-testid="swo-recent-bet-row"]'),
    ).toHaveLength(0);
  });

  it('also renders the empty surface when bets=[] is explicitly passed', () => {
    act(() => {
      root.render(<RecentBets bets={[]} />);
    });
    const section = container.querySelector('[data-testid="swo-recent-bets"]');
    expect(section!.getAttribute('data-state')).toBe('empty');
  });

  // (b/c) Renders rows when fed mock indexer data.
  it('(b) renders one row per bet across all three games (coinflip + dice + hilo)', () => {
    act(() => {
      root.render(
        <RecentBets bets={[HILO_CASHED, DICE_LOSS, COINFLIP_WIN]} />,
      );
    });
    const section = container.querySelector('[data-testid="swo-recent-bets"]');
    expect(section!.getAttribute('data-state')).toBe('populated');

    const rows = container.querySelectorAll(
      '[data-testid="swo-recent-bet-row"]',
    );
    expect(rows).toHaveLength(3);
    const games = Array.from(rows).map((r) => r.getAttribute('data-game'));
    expect(games).toEqual(['hilo', 'dice', 'coinflip']);

    const chipKinds = Array.from(
      container.querySelectorAll('[data-testid="swo-recent-bet-outcome-chip"]'),
    ).map((c) => c.getAttribute('data-outcome'));
    expect(chipKinds).toEqual(['won', 'lost', 'won']);
  });

  it('formats stake → payout columns with 4dp precision (mixed MON/USDm via symbolFor)', () => {
    const symbolFor = (b: WalletBet) =>
      b.game === 'dice' ? ('USDm' as const) : ('MON' as const);

    act(() => {
      root.render(
        <RecentBets
          bets={[COINFLIP_WIN, HILO_CASHED, DICE_LOSS]}
          symbolFor={symbolFor}
        />,
      );
    });

    const stakes = Array.from(
      container.querySelectorAll('[data-testid="swo-recent-bet-stake"]'),
    ).map((el) => el.textContent);
    expect(stakes[0]).toBe('0.01 MON');
    expect(stakes[1]).toBe('0.02 MON');
    expect(stakes[2]).toBe('0.005 USDm');

    const payouts = Array.from(
      container.querySelectorAll('[data-testid="swo-recent-bet-payout"]'),
    ).map((el) => el.textContent);
    expect(payouts[0]).toBe('0.0198 MON');
    expect(payouts[1]).toBe('0.033 MON');
    // Null payoutWei renders the zero placeholder with the row's symbol.
    expect(payouts[2]).toBe('0 USDm');
  });

  it('links betId to /verify/[betId] and txHash to the supplied explorer base', () => {
    act(() => {
      root.render(
        <RecentBets
          bets={[COINFLIP_WIN, DICE_LOSS]}
          explorerBaseUrl="https://explorer.example"
        />,
      );
    });

    const verifyLinks = container.querySelectorAll(
      '[data-testid="swo-recent-bet-betid-link"]',
    );
    expect(verifyLinks[0].getAttribute('href')).toBe('/verify/1');
    expect(verifyLinks[1].getAttribute('href')).toBe('/verify/7');

    // Only the first bet has a txHash → exactly one explorer link.
    const txLinks = container.querySelectorAll(
      '[data-testid="swo-recent-bet-tx-link"]',
    );
    expect(txLinks).toHaveLength(1);
    expect(txLinks[0].getAttribute('href')).toBe(
      `https://explorer.example/tx/${COINFLIP_WIN.txHash}`,
    );
    expect(txLinks[0].getAttribute('target')).toBe('_blank');
    expect(txLinks[0].getAttribute('rel')).toBe('noreferrer');
    expect(txLinks[0].textContent).toMatch(/^0x[a-f]{4}…[a-f]{4}$/);
  });

  it('announces the populated row count once for screen readers', () => {
    act(() => {
      root.render(
        <RecentBets bets={[COINFLIP_WIN, DICE_LOSS, HILO_CASHED]} />,
      );
    });
    const announces = container.querySelectorAll(
      '[data-testid="swo-recent-bets-status"]',
    );
    expect(announces).toHaveLength(1);
    expect(announces[0].getAttribute('aria-live')).toBe('polite');
    expect(announces[0].textContent).toMatch(/loaded 3 recent bets/i);
  });
});
