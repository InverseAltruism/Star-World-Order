// Regression guard for [SWO_CASINO_MASCOT_SWAP] (PR #317).
//
// Locks in the three acceptance criteria so the Star Skrumpey dealer art
// can't silently regress to upstream BunnyBagz rabbit imagery:
//
//   (a) BB rabbit asset filenames absent from casino routes / components /
//       public assets — `bunny` and `rabbit` must not appear (case-insensitive)
//       under app/casino, components/casino, or public/casino.
//   (b) The Skrumpey dealer image set is present at the expected paths
//       (idle / happy / excited) and is a non-empty PNG.
//   (c) BetPanel and FairnessProof default their dealer art to the
//       Skrumpey dealer image set, so every game page that consumes those
//       components renders Skrumpey art without an explicit override.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_DEALER_ART_SRC,
} from '../BetPanel';
import {
  DEFAULT_FAIRNESS_DEALER_ART_SRC,
} from '../FairnessProof';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const DEALER_ASSETS = [
  'public/casino/skrumpey-dealer-idle.png',
  'public/casino/skrumpey-dealer-happy.png',
  'public/casino/skrumpey-dealer-excited.png',
];

const SCAN_ROOTS = ['app/casino', 'components/casino', 'public/casino'];

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.md',
  '.html',
  '.svg',
  '.yml',
  '.yaml',
]);

// Self-reference tokens (case-insensitive) — used to keep this test file
// itself out of the scan so the bare words below don't trip the guard.
const SELF_FILE = path.resolve(__dirname, 'mascotSwap.test.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

describe('[SWO_CASINO_MASCOT_SWAP] regression guard', () => {
  it('default dealer art for BetPanel points at the Skrumpey idle sprite', () => {
    expect(DEFAULT_DEALER_ART_SRC).toBe('/casino/skrumpey-dealer-idle.png');
  });

  it('default dealer art for FairnessProof points at the Skrumpey happy sprite', () => {
    expect(DEFAULT_FAIRNESS_DEALER_ART_SRC).toBe(
      '/casino/skrumpey-dealer-happy.png',
    );
  });

  it.each(DEALER_ASSETS)(
    'ships a non-empty PNG at %s',
    (relPath) => {
      const abs = path.join(REPO_ROOT, relPath);
      const stats = statSync(abs);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
      const head = readFileSync(abs).subarray(0, PNG_SIGNATURE.length);
      expect(head.equals(PNG_SIGNATURE)).toBe(true);
    },
  );

  it('contains no bunny / rabbit references under casino routes, components, or public assets', () => {
    const offenders: Array<{ file: string; match: string }> = [];
    const pattern = /bunny|rabbit/i;

    for (const rel of SCAN_ROOTS) {
      const root = path.join(REPO_ROOT, rel);
      let files: string[];
      try {
        files = walk(root);
      } catch {
        // Missing scan root is fine — nothing to inspect there.
        continue;
      }

      for (const file of files) {
        if (path.resolve(file) === SELF_FILE) continue;
        const ext = path.extname(file).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) {
          // For binaries (e.g. PNGs) the filename itself is the surface,
          // so guard against renamed bb_rabbit.png-style assets.
          const base = path.basename(file);
          if (pattern.test(base)) {
            offenders.push({ file, match: base });
          }
          continue;
        }
        const text = readFileSync(file, 'utf8');
        const hit = text.match(pattern);
        if (hit) {
          offenders.push({ file, match: hit[0] });
        }
        const base = path.basename(file);
        if (pattern.test(base)) {
          offenders.push({ file, match: base });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
