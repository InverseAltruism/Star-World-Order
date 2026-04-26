import { describe, it, expect } from 'vitest';
import type { SanctuaryChatMemory, SanctuaryChatMemoryCategory } from '@/lib/db';
import {
  jaccardSimilarity,
  normalizeFactText,
  planConsolidation,
  summarizePlan,
  tokenizeFact,
  CONSOLIDATION_DEFAULTS,
} from '../memoryConsolidation';

let nextId = 1;

function makeMemory(
  category: SanctuaryChatMemoryCategory,
  fact: string,
  overrides: Partial<SanctuaryChatMemory> = {},
): SanctuaryChatMemory {
  const id = overrides.id ?? nextId++;
  return {
    id,
    wallet_address: '0xtest',
    token_id: 1,
    category,
    fact,
    importance: 1,
    mention_count: 1,
    last_mentioned_at: '2026-04-26T00:00:00.000Z',
    source_message_id: null,
    created_at: '2026-04-26T00:00:00.000Z',
    updated_at: '2026-04-26T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeFactText', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeFactText('  Likes  Cosmic-Berries!! ')).toBe('likes cosmic berries');
  });
  it('returns empty for empty input', () => {
    expect(normalizeFactText('')).toBe('');
  });
});

describe('tokenizeFact', () => {
  it('drops stop words and short tokens', () => {
    expect(tokenizeFact('They are in the sanctuary today')).toEqual(['sanctuary', 'today']);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical normalized facts', () => {
    expect(jaccardSimilarity('Holder likes tea', 'holder likes tea!')).toBe(1);
  });
  it('returns 0 for entirely disjoint facts', () => {
    expect(jaccardSimilarity('Holder likes tea', 'sky burns red')).toBe(0);
  });
  it('returns a value in (0,1) for partial overlap', () => {
    const sim = jaccardSimilarity('Holder enjoys cosmic berries', 'Holder loves cosmic berries');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
  it('returns 1 when both facts are empty after tokenization', () => {
    expect(jaccardSimilarity('the a is', 'or to in')).toBe(1);
  });
});

describe('planConsolidation — merges', () => {
  it('returns no merges for distinct facts within a category', () => {
    const memories = [
      makeMemory('preferences', 'Loves cosmic berries'),
      makeMemory('preferences', 'Dislikes loud noises'),
    ];
    const plan = planConsolidation(memories, { now: Date.parse('2026-04-26T00:00:00Z') });
    expect(plan.merges).toEqual([]);
  });

  it('merges duplicate preferences (same category, near-identical fact)', () => {
    const a = makeMemory('preferences', 'Loves cosmic berries', { id: 10, importance: 2, mention_count: 3 });
    const b = makeMemory('preferences', 'loves cosmic berries!', { id: 11, importance: 4, mention_count: 1 });
    const plan = planConsolidation([a, b], { now: Date.parse('2026-04-26T00:00:00Z') });
    expect(plan.merges).toHaveLength(1);
    const merge = plan.merges[0];
    expect(merge.category).toBe('preferences');
    expect(merge.keepId).toBe(11);
    expect(merge.removeIds).toEqual([10]);
    expect(merge.newImportance).toBe(4);
    expect(merge.newMentionCount).toBe(4);
  });

  it('does not merge across categories even with identical text', () => {
    const a = makeMemory('preferences', 'cosmic berries', { id: 1 });
    const b = makeMemory('recurring_topics', 'cosmic berries', { id: 2 });
    const plan = planConsolidation([a, b], { now: Date.parse('2026-04-26T00:00:00Z') });
    expect(plan.merges).toEqual([]);
  });

  it('clusters recurring_topics with looser similarity (summarization)', () => {
    const a = makeMemory('recurring_topics', 'asks about the constellations', { id: 1, importance: 3, mention_count: 2 });
    const b = makeMemory('recurring_topics', 'asks about constellations again', { id: 2, importance: 1, mention_count: 1 });
    const plan = planConsolidation([a, b], { now: Date.parse('2026-04-26T00:00:00Z') });
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].keepId).toBe(1);
    expect(plan.merges[0].removeIds).toEqual([2]);
    expect(plan.merges[0].newMentionCount).toBe(3);
  });

  it('does NOT cluster the same loose pair when category is preferences (stricter threshold)', () => {
    const a = makeMemory('preferences', 'asks about the constellations', { id: 1, importance: 3 });
    const b = makeMemory('preferences', 'asks about constellations again', { id: 2, importance: 1 });
    const plan = planConsolidation([a, b], { now: Date.parse('2026-04-26T00:00:00Z') });
    expect(plan.merges).toEqual([]);
  });

  it('keeps the highest-importance memory as the cluster representative', () => {
    const a = makeMemory('preferences', 'enjoys quiet evenings', { id: 1, importance: 1 });
    const b = makeMemory('preferences', 'enjoys quiet evenings', { id: 2, importance: 5 });
    const c = makeMemory('preferences', 'enjoys quiet evenings', { id: 3, importance: 3 });
    const plan = planConsolidation([a, b, c], { now: Date.parse('2026-04-26T00:00:00Z') });
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].keepId).toBe(2);
    expect(plan.merges[0].removeIds.sort()).toEqual([1, 3]);
    expect(plan.merges[0].newImportance).toBe(5);
  });

  it('clamps newImportance to [1,5]', () => {
    const a = makeMemory('preferences', 'fact', { id: 1, importance: 5 });
    const b = makeMemory('preferences', 'fact', { id: 2, importance: 5 });
    const plan = planConsolidation([a, b], { now: Date.parse('2026-04-26T00:00:00Z') });
    expect(plan.merges[0].newImportance).toBe(5);
  });
});

describe('planConsolidation — decays', () => {
  const now = Date.parse('2026-04-26T00:00:00Z');

  it('decays old companion_feelings importance by 1', () => {
    const old = makeMemory('companion_feelings', 'I feel safe near them', {
      id: 1,
      importance: 4,
      last_mentioned_at: '2026-04-01T00:00:00Z', // ~25 days old
    });
    const plan = planConsolidation([old], { now, feelingDecayAfterDays: 14 });
    expect(plan.decays).toHaveLength(1);
    expect(plan.decays[0].id).toBe(1);
    expect(plan.decays[0].oldImportance).toBe(4);
    expect(plan.decays[0].newImportance).toBe(3);
  });

  it('does not decay recent companion_feelings', () => {
    const recent = makeMemory('companion_feelings', 'I feel curious', {
      id: 2,
      importance: 4,
      last_mentioned_at: '2026-04-25T00:00:00Z', // 1 day old
    });
    const plan = planConsolidation([recent], { now, feelingDecayAfterDays: 14 });
    expect(plan.decays).toEqual([]);
  });

  it('does not decay below importance 1', () => {
    const stuck = makeMemory('companion_feelings', 'fading feeling', {
      id: 3,
      importance: 1,
      last_mentioned_at: '2026-01-01T00:00:00Z',
    });
    const plan = planConsolidation([stuck], { now, feelingDecayAfterDays: 14 });
    expect(plan.decays).toEqual([]);
  });

  it('does not decay non-feeling categories', () => {
    const old = makeMemory('preferences', 'old preference', {
      id: 4,
      importance: 4,
      last_mentioned_at: '2026-01-01T00:00:00Z',
    });
    const plan = planConsolidation([old], { now, feelingDecayAfterDays: 14 });
    expect(plan.decays).toEqual([]);
  });

  it('skips memories whose timestamps cannot be parsed', () => {
    const broken = makeMemory('companion_feelings', 'feeling', {
      id: 5,
      importance: 4,
      last_mentioned_at: 'not-a-date',
    });
    const plan = planConsolidation([broken], { now, feelingDecayAfterDays: 14 });
    expect(plan.decays).toEqual([]);
  });

  it('does not decay memories that were merged away in the same plan', () => {
    const old1 = makeMemory('companion_feelings', 'I feel calm', {
      id: 6,
      importance: 3,
      last_mentioned_at: '2026-01-01T00:00:00Z',
    });
    const old2 = makeMemory('companion_feelings', 'i feel calm!', {
      id: 7,
      importance: 4,
      last_mentioned_at: '2026-01-01T00:00:00Z',
    });
    const plan = planConsolidation([old1, old2], { now, feelingDecayAfterDays: 14 });
    expect(plan.merges).toHaveLength(1);
    // Survivor (keeper) may still be decayed.
    const survivorId = plan.merges[0].keepId;
    expect(plan.decays.map((d) => d.id)).toEqual([survivorId]);
  });
});

describe('summarizePlan', () => {
  it('counts merged removals and decays', () => {
    const plan = planConsolidation([
      makeMemory('preferences', 'cosmic berries', { id: 1 }),
      makeMemory('preferences', 'cosmic berries', { id: 2 }),
      makeMemory('preferences', 'cosmic berries', { id: 3 }),
      makeMemory('companion_feelings', 'feeling', {
        id: 4,
        importance: 3,
        last_mentioned_at: '2026-01-01T00:00:00Z',
      }),
    ], { now: Date.parse('2026-04-26T00:00:00Z') });
    const sum = summarizePlan(plan);
    expect(sum.merged).toBe(2);
    expect(sum.decayed).toBe(1);
  });
});

describe('CONSOLIDATION_DEFAULTS', () => {
  it('exposes sensible defaults', () => {
    expect(CONSOLIDATION_DEFAULTS.duplicateSimilarityThreshold).toBeGreaterThan(0.5);
    expect(CONSOLIDATION_DEFAULTS.topicClusterThreshold).toBeGreaterThan(0);
    expect(CONSOLIDATION_DEFAULTS.feelingDecayAfterDays).toBeGreaterThan(0);
  });
});
