import { describe, it, expect } from 'vitest';
import {
  parseMemoryExtraction,
  buildMemoryExtractionInstruction,
  MEMORY_BLOCK_OPEN,
  MEMORY_BLOCK_CLOSE,
  MAX_MEMORIES_PER_EXTRACTION,
} from '../chatMemories';

describe('parseMemoryExtraction', () => {
  it('returns the original reply and no memories when no block present', () => {
    const out = parseMemoryExtraction('Hello, friend! The cosmos shines on you today.');
    expect(out.cleanReply).toBe('Hello, friend! The cosmos shines on you today.');
    expect(out.memories).toEqual([]);
  });

  it('strips a well-formed memory block from the reply', () => {
    const raw = `The stars sparkle as we chat.\n\n${MEMORY_BLOCK_OPEN}\n[{"category":"owner_identity","fact":"Holder is named Alex","importance":4}]\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.cleanReply).toBe('The stars sparkle as we chat.');
    expect(out.memories).toHaveLength(1);
    expect(out.memories[0].category).toBe('owner_identity');
    expect(out.memories[0].fact).toBe('Holder is named Alex');
    expect(out.memories[0].importance).toBe(4);
  });

  it('parses multiple memories and clamps to MAX_MEMORIES_PER_EXTRACTION', () => {
    const memories = [
      { category: 'owner_identity', fact: 'Their name is Sam' },
      { category: 'preferences', fact: 'They love cosmic berries' },
      { category: 'companion_feelings', fact: 'I feel safe near them' },
      { category: 'recurring_topics', fact: 'They ask about the constellations' },
      { category: 'shared_experiences', fact: 'We visited the Hot Springs' },
    ];
    const raw = `Reply.\n${MEMORY_BLOCK_OPEN}${JSON.stringify(memories)}${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.memories.length).toBeLessThanOrEqual(MAX_MEMORIES_PER_EXTRACTION);
    expect(out.cleanReply).toBe('Reply.');
  });

  it('rejects unknown categories silently', () => {
    const raw = `Hi.\n${MEMORY_BLOCK_OPEN}\n[{"category":"made_up","fact":"x"},{"category":"preferences","fact":"likes tea"}]\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.memories).toHaveLength(1);
    expect(out.memories[0].category).toBe('preferences');
  });

  it('drops memories with empty facts', () => {
    const raw = `Hi.\n${MEMORY_BLOCK_OPEN}\n[{"category":"preferences","fact":""},{"category":"preferences","fact":"likes berries"}]\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.memories).toHaveLength(1);
    expect(out.memories[0].fact).toBe('likes berries');
  });

  it('clamps importance to 1..5', () => {
    const raw = `Hi.\n${MEMORY_BLOCK_OPEN}\n[{"category":"preferences","fact":"a","importance":99},{"category":"preferences","fact":"b","importance":-3}]\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.memories[0].importance).toBe(5);
    expect(out.memories[1].importance).toBe(1);
  });

  it('defaults importance to 1 when missing or non-numeric', () => {
    const raw = `Hi.\n${MEMORY_BLOCK_OPEN}\n[{"category":"preferences","fact":"a"},{"category":"preferences","fact":"b","importance":"high"}]\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.memories[0].importance).toBe(1);
    expect(out.memories[1].importance).toBe(1);
  });

  it('handles malformed JSON gracefully (returns no memories, keeps clean reply text)', () => {
    const raw = `Reply.\n${MEMORY_BLOCK_OPEN}\nnot-json-at-all\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.cleanReply).toBe('Reply.');
    expect(out.memories).toEqual([]);
  });

  it('recovers when model wraps the JSON in a fence', () => {
    const raw = `Reply.\n${MEMORY_BLOCK_OPEN}\n\`\`\`json\n[{"category":"preferences","fact":"likes purple"}]\n\`\`\`\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.memories).toHaveLength(1);
    expect(out.memories[0].fact).toBe('likes purple');
  });

  it('recovers when block is unterminated (uses everything after the open tag)', () => {
    const raw = `Reply.\n${MEMORY_BLOCK_OPEN}\n[{"category":"preferences","fact":"likes purple"}]`;
    const out = parseMemoryExtraction(raw);
    expect(out.cleanReply).toBe('Reply.');
    expect(out.memories).toHaveLength(1);
  });

  it('dedupes identical category+fact entries within one extraction', () => {
    const raw = `Hi.\n${MEMORY_BLOCK_OPEN}\n[{"category":"preferences","fact":"likes tea"},{"category":"preferences","fact":"LIKES TEA"}]\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.memories).toHaveLength(1);
  });

  it('truncates very long facts to 280 chars', () => {
    const long = 'x'.repeat(500);
    const raw = `Hi.\n${MEMORY_BLOCK_OPEN}\n[{"category":"preferences","fact":"${long}"}]\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    expect(out.memories[0].fact.length).toBe(280);
  });

  it('returns empty result for empty input', () => {
    expect(parseMemoryExtraction('').memories).toEqual([]);
    expect(parseMemoryExtraction('').cleanReply).toBe('');
  });

  it('falls back to raw reply if cleanReply would be empty', () => {
    // Edge case: model returned ONLY the memory block, no prose reply.
    const raw = `${MEMORY_BLOCK_OPEN}\n[{"category":"preferences","fact":"likes tea"}]\n${MEMORY_BLOCK_CLOSE}`;
    const out = parseMemoryExtraction(raw);
    // cleanReply will be empty after stripping; tested behaviour falls back to raw trim.
    expect(out.cleanReply).toBe(raw.trim());
    expect(out.memories).toHaveLength(1);
  });
});

describe('buildMemoryExtractionInstruction', () => {
  it('mentions all 5 categories', () => {
    const text = buildMemoryExtractionInstruction();
    for (const c of ['owner_identity', 'preferences', 'shared_experiences', 'companion_feelings', 'recurring_topics']) {
      expect(text).toContain(c);
    }
  });

  it('mentions the open and close tags', () => {
    const text = buildMemoryExtractionInstruction();
    expect(text).toContain(MEMORY_BLOCK_OPEN);
    expect(text).toContain(MEMORY_BLOCK_CLOSE);
  });

  it('instructs the model to skip the block when nothing is new', () => {
    const text = buildMemoryExtractionInstruction();
    expect(text.toLowerCase()).toContain('omit the block');
  });
});
