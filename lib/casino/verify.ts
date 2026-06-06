/**
 * Casino commit-reveal verifier — pure TypeScript, isomorphic (Node + browser).
 *
 * Ported from BunnyBagz `packages/verify` for SWO [SWO_CASINO_LIB_VERIFY]:
 *   - `computeCommit(reveal)` — sha256(reveal) as 0x-prefixed hex
 *   - `verifyCommit(reveal, commit)` — boolean check that reveal matches commit
 *   - `verifyReveal(reveal, commit)` — alias of verifyCommit (BB-style naming)
 *   - `computeOutcome({ reveal, salt, game })` — game outcome derived from the
 *     reveal/salt entropy. Deterministic, side-effect free.
 *   - `deriveTriple(input)` — returns { commit, reveal, outcome } that the
 *     FairnessProof component renders verbatim. Used as the single source of
 *     truth for both the UI and the test suite.
 *
 * The hash function (SHA-256) comes from `@noble/hashes`, the same pure-JS
 * library used by viem/wagmi. It's already in the dependency tree so this
 * module ships zero extra bytes and stays sync (no SubtleCrypto Promise).
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/** Supported casino games — game-specific outcome shape per entry below. */
export type CasinoGame = 'coinflip' | 'dice' | 'hilo';

/** The triple a fair bet exposes after the reveal. */
export interface FairnessTriple {
  commit: string; // 0x-prefixed sha256(reveal)
  reveal: string; // 0x-prefixed hex (post-reveal secret)
  outcome: string; // game-specific outcome label
}

export interface OutcomeInput {
  reveal: string; // 0x-prefixed hex (or plain hex)
  salt?: string; // optional public client-seed / nonce, plain string
  game?: CasinoGame; // defaults to 'coinflip'
}

/** Normalize a hex string to its 0x-prefixed lowercase form. */
function normHex(hex: string): string {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(stripped)) {
    throw new Error(`verify: invalid hex input: ${hex}`);
  }
  return `0x${stripped.toLowerCase()}`;
}

/** sha256 over a UTF-8 string OR a 0x-prefixed hex blob → 0x-hex digest. */
function sha256OfMaybeHex(input: string): string {
  let bytes: Uint8Array;
  if (input.startsWith('0x')) {
    bytes = hexToBytes(input.slice(2));
  } else {
    bytes = utf8ToBytes(input);
  }
  return `0x${bytesToHex(sha256(bytes))}`;
}

/** Commit = sha256(reveal). Input/output both 0x-prefixed lowercase hex. */
export function computeCommit(reveal: string): string {
  return sha256OfMaybeHex(normHex(reveal));
}

/** True when the supplied reveal hashes to the supplied commit. */
export function verifyCommit(reveal: string, commit: string): boolean {
  try {
    return computeCommit(reveal) === normHex(commit);
  } catch {
    return false;
  }
}

/** BB-style alias: verifies a revealed seed against a published commit. */
export function verifyReveal(reveal: string, commit: string): boolean {
  return verifyCommit(reveal, commit);
}

/**
 * Derive a game outcome from the reveal + an optional client salt.
 *
 * Algorithm:
 *   1. h = sha256(reveal || ':' || salt)     (salt defaults to '')
 *   2. Interpret first 4 bytes of h as a big-endian uint32 → roll.
 *   3. Map roll → game-specific outcome string:
 *        coinflip: 'heads' if roll even else 'tails'
 *        dice:     '1'…'6' from (roll % 6) + 1
 *        hilo:     'high' if (roll % 100) >= 50 else 'low'
 *
 * Deterministic, no I/O — identical inputs always yield identical outputs.
 */
export function computeOutcome(input: OutcomeInput): string {
  const reveal = normHex(input.reveal);
  const salt = input.salt ?? '';
  const game: CasinoGame = input.game ?? 'coinflip';

  const revealBytes = hexToBytes(reveal.slice(2));
  const saltBytes = utf8ToBytes(`:${salt}`);
  const combined = new Uint8Array(revealBytes.length + saltBytes.length);
  combined.set(revealBytes, 0);
  combined.set(saltBytes, revealBytes.length);
  const digest = sha256(combined);

  // Read first 4 bytes as a big-endian uint32. The trailing `>>> 0` reinterprets
  // the signed-int32 result of the OR chain as unsigned, so `roll % N` and
  // `roll & 1` behave correctly across the full 0..2^32-1 range.
  const roll =
    (((digest[0] << 24) |
      (digest[1] << 16) |
      (digest[2] << 8) |
      digest[3]) >>>
      0);

  switch (game) {
    case 'dice':
      return String((roll % 6) + 1);
    case 'hilo':
      return roll % 100 >= 50 ? 'high' : 'low';
    case 'coinflip':
    default:
      return roll % 2 === 0 ? 'heads' : 'tails';
  }
}

/**
 * Convenience: derive the entire { commit, reveal, outcome } triple that the
 * FairnessProof UI renders. Component and tests both call this so the
 * acceptance check `component renders the same triple verify.ts derives`
 * collapses to a single source of truth.
 */
export function deriveTriple(input: OutcomeInput): FairnessTriple {
  const reveal = normHex(input.reveal);
  return {
    commit: computeCommit(reveal),
    reveal,
    outcome: computeOutcome({ ...input, reveal }),
  };
}
