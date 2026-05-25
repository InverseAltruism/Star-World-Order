import { describe, it, expect } from 'vitest';
import { individualPersona } from '../chatPersonality';

describe('per-Skrumpey individual persona', () => {
  it('is deterministic per token id', () => {
    expect(individualPersona(561)).toEqual(individualPersona(561));
    expect(individualPersona(1)).toEqual(individualPersona(1));
  });

  it('gives different tokens different blends (well spread)', () => {
    const blends = new Set<string>();
    for (let id = 1; id <= 200; id++) {
      const p = individualPersona(id);
      blends.add(`${p.temperament}|${p.quirk}|${p.tic}`);
    }
    // 200 tokens should map to many distinct personalities, not collapse to a few
    expect(blends.size).toBeGreaterThan(80);
  });

  it('always returns non-empty strings, even for odd ids', () => {
    for (const id of [0, -5, 3333, 999999]) {
      const p = individualPersona(id);
      expect(p.temperament.length).toBeGreaterThan(0);
      expect(p.quirk.length).toBeGreaterThan(0);
      expect(p.tic.length).toBeGreaterThan(0);
    }
  });
});
