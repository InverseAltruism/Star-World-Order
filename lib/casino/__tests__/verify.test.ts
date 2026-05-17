// verify.ts — [SWO_CASINO_LIB_VERIFY] acceptance.
//   (a) module exists & exports computeCommit / verifyCommit /
//       verifyReveal / computeOutcome / deriveTriple
//   (b) deterministic: identical inputs yield identical triples
//   (c) tamper detection: changing the reveal flips verifyCommit to false
//   (d) game outcome mapping is stable & enumerable
//
// Tests intentionally use simple, hand-checked vectors so future readers can
// re-derive the digests with `node -e "console.log(require('crypto').createHash('sha256').update(...).digest('hex'))"`.

import { describe, it, expect } from 'vitest';

import {
  computeCommit,
  computeOutcome,
  deriveTriple,
  verifyCommit,
  verifyReveal,
} from '../verify';

const REVEAL_A =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const REVEAL_B =
  '0xdeadbeefcafebabe00000000000000000000000000000000000000000000beef';

describe('verify — computeCommit', () => {
  it('hashes a known reveal to a stable 32-byte commit', () => {
    const commit = computeCommit(REVEAL_A);
    expect(commit).toMatch(/^0x[0-9a-f]{64}$/);
    // sha256 of the 32-byte big-endian "1" — stable across all SHA-256 impls.
    expect(commit).toBe(
      '0xec4916dd28fc4c10d78e287ca5d9cc51ee1ae73cbfde08c6b37324cbfaac8bc5',
    );
  });

  it('is deterministic — same reveal in, same commit out', () => {
    expect(computeCommit(REVEAL_B)).toBe(computeCommit(REVEAL_B));
  });

  it('accepts the reveal with or without a 0x prefix', () => {
    expect(computeCommit(REVEAL_A)).toBe(computeCommit(REVEAL_A.slice(2)));
  });
});

describe('verify — verifyCommit / verifyReveal', () => {
  it('verifyCommit returns true for a matching pair', () => {
    const commit = computeCommit(REVEAL_A);
    expect(verifyCommit(REVEAL_A, commit)).toBe(true);
  });

  it('verifyCommit returns false when the reveal is tampered', () => {
    const commit = computeCommit(REVEAL_A);
    expect(verifyCommit(REVEAL_B, commit)).toBe(false);
  });

  it('verifyReveal is an alias of verifyCommit', () => {
    const commit = computeCommit(REVEAL_B);
    expect(verifyReveal(REVEAL_B, commit)).toBe(true);
    expect(verifyReveal(REVEAL_A, commit)).toBe(false);
  });

  it('returns false (does not throw) on malformed hex input', () => {
    expect(verifyCommit('0xnothex', '0x' + 'a'.repeat(64))).toBe(false);
  });
});

describe('verify — computeOutcome', () => {
  it('coinflip yields heads or tails and is deterministic per reveal', () => {
    const out1 = computeOutcome({ reveal: REVEAL_A, game: 'coinflip' });
    const out2 = computeOutcome({ reveal: REVEAL_A, game: 'coinflip' });
    expect(out1).toBe(out2);
    expect(['heads', 'tails']).toContain(out1);
  });

  it('dice yields 1..6', () => {
    const out = computeOutcome({ reveal: REVEAL_B, game: 'dice' });
    expect(['1', '2', '3', '4', '5', '6']).toContain(out);
  });

  it('hilo yields high or low', () => {
    const out = computeOutcome({ reveal: REVEAL_A, game: 'hilo' });
    expect(['high', 'low']).toContain(out);
  });

  it('changing reveal changes the derived outcome (entropy not stuck)', () => {
    // Game-specific outcomes have narrow ranges (2/6/2) so mod-collisions are
    // common; iterate a few reveals so the assertion is fair across hash
    // bias rather than coincidence.
    const outA = computeOutcome({ reveal: REVEAL_A, game: 'dice' });
    const others = [
      '0x0000000000000000000000000000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000000000000000000000000000003',
      '0x0000000000000000000000000000000000000000000000000000000000000004',
      '0x0000000000000000000000000000000000000000000000000000000000000005',
      '0x0000000000000000000000000000000000000000000000000000000000000006',
    ].map((r) => computeOutcome({ reveal: r, game: 'dice' }));
    expect(others.some((o) => o !== outA)).toBe(true);
  });
});

describe('verify — deriveTriple', () => {
  it('returns commit, normalized reveal, and outcome together', () => {
    const triple = deriveTriple({
      reveal: REVEAL_A,
      salt: 's',
      game: 'coinflip',
    });
    expect(triple.commit).toBe(computeCommit(REVEAL_A));
    expect(triple.reveal).toBe(REVEAL_A);
    expect(triple.outcome).toBe(
      computeOutcome({ reveal: REVEAL_A, salt: 's', game: 'coinflip' }),
    );
  });
});
