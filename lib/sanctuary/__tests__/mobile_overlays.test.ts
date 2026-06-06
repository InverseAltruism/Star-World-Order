// @vitest-environment node
//
// [SWO_SHARED_MOBILE_OVERLAYS] Static contract tests for mobile-friendly
// React overlays. These do not render React — vitest is configured for the
// node environment — but they enforce the responsive properties demanded by
// the task spec (≥44 px hit targets, fluid layout under 768 px,
// touch-friendly chat input + radial menu).
//
// If the source no longer satisfies the contract, the offending overlay
// will fail with a precise message naming the missing class.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../');
const OVERLAY_DIR = resolve(ROOT, 'components/sanctuary/overlays');

function read(name: string): string {
  return readFileSync(resolve(OVERLAY_DIR, name), 'utf8');
}

/**
 * Tailwind treats `min-h-[44px]` and `min-w-[44px]` as the canonical opt-in
 * for the iOS/Android recommended 44 px touch target. We check for those
 * (or the larger w-14/h-14 = 56 px) on every primary interactive element.
 */
const FORTY_FOUR = /min-h-\[44px\]|min-h-11|h-11|h-12|h-14|h-16/;

describe('[SWO_SHARED_MOBILE_OVERLAYS] CompanionMenu radial buttons', () => {
  const src = read('CompanionMenu.tsx');

  it('uses ≥44 px radial buttons (w-14 h-14 with min-w/min-h fallback)', () => {
    expect(src).toMatch(/w-14 h-14/);
    expect(src).toMatch(/min-w-\[44px\]/);
    expect(src).toMatch(/min-h-\[44px\]/);
  });

  it('opts into touch-manipulation for instant tap response', () => {
    expect(src).toMatch(/touch-manipulation/);
  });

  it('clamps radial menu inside the viewport so no button clips offscreen', () => {
    expect(src).toMatch(/window\.innerWidth/);
    expect(src).toMatch(/window\.innerHeight/);
    expect(src).toMatch(/Math\.(min|max)/);
  });

  it('keeps button centers far enough apart that 56 px buttons do not overlap', () => {
    const match = src.match(/RADIAL_DISTANCE\s*=\s*(\d+)/);
    expect(match, 'RADIAL_DISTANCE constant must be defined').not.toBeNull();
    const distance = Number(match![1]);
    // 56 px buttons sit on a circle of radius DISTANCE; chord between
    // 120°-spaced buttons is DISTANCE * sqrt(3). Need ≥ 56 + 8 px of clearance.
    const chord = distance * Math.sqrt(3);
    expect(chord).toBeGreaterThanOrEqual(64);
  });
});

describe('[SWO_SHARED_MOBILE_OVERLAYS] ChatInput', () => {
  const src = read('ChatInput.tsx');

  it('input field is ≥44 px tall', () => {
    expect(src).toMatch(/min-h-\[44px\]/);
  });

  it('uses 16 px font on the input to suppress iOS Safari auto-zoom', () => {
    expect(src).toMatch(/fontSize:\s*['"]16px['"]/);
  });

  it('Send button has a 44 px hit area and touch-manipulation', () => {
    // The Send button is the second min-h occurrence; the regex global
    // match should produce ≥2 hits when both input + button are sized.
    const hits = src.match(/min-h-\[44px\]/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/touch-manipulation/);
  });

  it('respects iOS safe-area-inset-bottom so the input is not hidden by the home indicator', () => {
    expect(src).toMatch(/safe-area-inset-bottom/);
  });

  it('layout is fluid (no fixed widths that would overflow under 768 px)', () => {
    // bottom-2 left-2 right-2 stretches edge-to-edge with 8 px gutters,
    // and flex-1 + min-w-0 lets the input shrink without overflow.
    expect(src).toMatch(/left-2 right-2/);
    expect(src).toMatch(/flex-1[^"]*min-w-0|min-w-0[^"]*flex-1/);
  });
});

describe('[SWO_SHARED_MOBILE_OVERLAYS] CompanionChatOverlay', () => {
  const src = read('CompanionChatOverlay.tsx');

  it('panel caps width to viewport on small screens', () => {
    expect(src).toMatch(/max-w-\[calc\(100vw-1rem\)\]/);
  });

  it('clamps panel position so it never spills past the viewport', () => {
    expect(src).toMatch(/window\.innerWidth/);
    expect(src).toMatch(/offsetWidth/);
  });

  it('close button has a 44 px hit area', () => {
    expect(src).toMatch(/min-w-\[44px\] min-h-\[44px\][^]*aria-label="Close chat"|aria-label="Close chat"[^]*min-w-\[44px\] min-h-\[44px\]/);
  });

  it('embedded chat input is ≥44 px tall and uses 16 px font', () => {
    expect(src).toMatch(/min-h-\[44px\]/);
    expect(src).toMatch(/fontSize:\s*['"]16px['"]/);
  });

  it('Send button has ≥44 px hit area and touch-manipulation', () => {
    const hits = src.match(/min-h-\[44px\]/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(3); // close + input + send
    expect(src).toMatch(/touch-manipulation/);
  });
});

describe('[SWO_SHARED_MOBILE_OVERLAYS] QuestTracker', () => {
  const src = read('QuestTracker.tsx');

  it('panel is fluid under 768 px (max-w viewport-relative)', () => {
    expect(src).toMatch(/max-w-\[calc\(100vw-1rem\)\]/);
  });

  it('expand/collapse header and OPEN BOARD button are ≥44 px', () => {
    const hits = src.match(/min-h-\[44px\]/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it('marks tappable controls as touch-manipulation', () => {
    expect(src).toMatch(/touch-manipulation/);
  });
});

describe('[SWO_SHARED_MOBILE_OVERLAYS] regression — no shrunken touch targets in primary overlays', () => {
  const PRIMARY = ['CompanionMenu.tsx', 'ChatInput.tsx', 'CompanionChatOverlay.tsx', 'QuestTracker.tsx'];
  for (const name of PRIMARY) {
    it(`${name} declares at least one ≥44 px control`, () => {
      const src = read(name);
      expect(src, `${name} should expose a 44+ px touch target`).toMatch(FORTY_FOUR);
    });
  }
});
