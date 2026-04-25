import { describe, it, expect } from 'vitest';
import {
  buildChatPrompt,
  buildMemoryContextBlock,
  bondLabel,
  moodLabel,
  estimateTokens,
  estimatePromptTokens,
  CONSTELLATION_PERSONAS,
  DEFAULT_PERSONA,
  MEMORY_INJECT_TOKEN_BUDGET,
  MAX_INJECTED_MEMORIES,
} from '../chatPersonality';
import type {
  SanctuaryCompanionWithMeta,
  SanctuaryChatMessage,
  SanctuaryJournalEntry,
  SanctuaryTrait,
  SanctuaryChatMemory,
  SanctuaryChatMemoryCategory,
} from '@/lib/db';

const mockCompanion = (overrides: Partial<SanctuaryCompanionWithMeta> = {}): SanctuaryCompanionWithMeta => ({
  id: 1,
  wallet_address: '0xabc',
  token_id: 42,
  is_active: 1,
  nickname: 'Stardust',
  current_activity: 'lounging',
  activity_started_at: null,
  activity_ends_at: null,
  bond_score: 65,
  total_interactions: 12,
  equipped_cosmetics: '{}',
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-02 00:00:00',
  constellation: 'aether',
  aura: 'glow',
  form: 'standard',
  mood: 'curious',
  background: 'space',
  eyes: 'glow',
  hat: null,
  image_url: null,
  rarity_rank: 100,
  attributes_json: null,
  companion_xp: 50,
  companion_level: 2,
  total_xp: 500,
  level: 3,
  ...overrides,
} as SanctuaryCompanionWithMeta);

const msg = (id: number, role: 'user' | 'companion', content: string, created_at: string): SanctuaryChatMessage => ({
  id,
  wallet_address: '0xabc',
  token_id: 42,
  role,
  content,
  created_at,
});

const journal = (id: number, entry_type: string, content: string, created_at: string): SanctuaryJournalEntry => ({
  id,
  wallet_address: '0xabc',
  token_id: 42,
  entry_type,
  content,
  metadata: '{}',
  created_at,
});

const trait = (id: number, name: string): SanctuaryTrait => ({
  id,
  wallet_address: '0xabc',
  token_id: 42,
  trait_name: name,
  trait_category: 'social',
  progress: 30,
  unlocked: 1,
  unlocked_at: '2026-01-01 00:00:00',
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
});

describe('bondLabel', () => {
  it('classifies bond by score', () => {
    expect(bondLabel(0)).toContain('new');
    expect(bondLabel(15)).toContain('budding');
    expect(bondLabel(40)).toContain('growing');
    expect(bondLabel(65)).toContain('strong');
    expect(bondLabel(85)).toContain('legendary');
  });
});

describe('moodLabel', () => {
  it('falls back to calm when missing', () => {
    expect(moodLabel(null)).toBe('calm');
    expect(moodLabel(undefined)).toBe('calm');
  });
  it('lowercases input', () => {
    expect(moodLabel('Excited')).toBe('excited');
  });
});

describe('estimateTokens', () => {
  it('returns 0 for empty', () => {
    expect(estimateTokens('')).toBe(0);
  });
  it('approximates 4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});

describe('CONSTELLATION_PERSONAS', () => {
  it('has all 10 known constellations', () => {
    const expected = ['aether', 'spectra', 'solveil', 'nebulu', 'chroma', 'rose', 'monflare', 'auracore', 'parallel', 'prime'];
    for (const c of expected) {
      expect(CONSTELLATION_PERSONAS[c]).toBeDefined();
      expect(CONSTELLATION_PERSONAS[c].description).toBeTruthy();
      expect(CONSTELLATION_PERSONAS[c].voice).toBeTruthy();
      expect(CONSTELLATION_PERSONAS[c].signaturePhrases.length).toBeGreaterThan(0);
    }
  });
});

describe('buildChatPrompt', () => {
  it('builds a prompt with system + user message', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      userMessage: 'Hello!',
    });
    expect(out.system).toContain('Stardust');
    expect(out.system).toContain('aether');
    expect(out.system).toContain('curious');
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0]).toEqual({ role: 'user', content: 'Hello!' });
  });

  it('uses default persona for unknown constellation', () => {
    const out = buildChatPrompt({
      companion: mockCompanion({ constellation: 'unknownConst' }),
      history: [],
      userMessage: 'Hi',
    });
    expect(out.system).toContain(DEFAULT_PERSONA.description);
  });

  it('falls back to token id when nickname is empty', () => {
    const out = buildChatPrompt({
      companion: mockCompanion({ nickname: null, token_id: 1234 }),
      history: [],
      userMessage: 'Yo',
    });
    expect(out.system).toContain('Skrumpey #1234');
  });

  it('orders history chronologically and includes user message last', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [
        msg(2, 'companion', 'Hi back', '2026-01-02 00:00:00'),
        msg(1, 'user', 'Hi', '2026-01-01 00:00:00'),
        msg(3, 'user', 'Hows it going', '2026-01-03 00:00:00'),
      ],
      userMessage: 'Latest',
    });
    expect(out.messages.length).toBe(4);
    expect(out.messages[0].content).toBe('Hi');
    expect(out.messages[0].role).toBe('user');
    expect(out.messages[1].content).toBe('Hi back');
    expect(out.messages[1].role).toBe('assistant');
    expect(out.messages[3].content).toBe('Latest');
    expect(out.messages[3].role).toBe('user');
  });

  it('truncates history to 8 messages', () => {
    const history: SanctuaryChatMessage[] = [];
    for (let i = 1; i <= 12; i++) {
      history.push(msg(i, i % 2 === 0 ? 'companion' : 'user', `m${i}`, `2026-01-${String(i).padStart(2, '0')} 00:00:00`));
    }
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history,
      userMessage: 'now',
    });
    // 8 history + 1 new = 9 total
    expect(out.messages.length).toBe(9);
    expect(out.messages[0].content).toBe('m5');
  });

  it('includes journal block when entries provided', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      journal: [
        journal(1, 'achievement', 'Unlocked Foodie', '2026-01-15 10:00:00'),
        journal(2, 'activity', 'Visited Hot Springs', '2026-01-14 09:00:00'),
      ],
      userMessage: 'Tell me about us',
    });
    expect(out.system).toContain('Recent memories');
    expect(out.system).toContain('Foodie');
    expect(out.system).toContain('2026-01-15');
  });

  it('mentions when journal is empty', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      userMessage: 'Hi',
    });
    expect(out.system).toContain('No notable journal memories');
  });

  it('includes unlocked traits in system prompt', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      unlockedTraits: [trait(1, 'Chatterbox'), trait(2, 'Foodie'), trait(3, 'Trailblazer')],
      userMessage: 'Hello',
    });
    expect(out.system).toContain('Chatterbox');
    expect(out.system).toContain('Foodie');
    expect(out.system).toContain('Trailblazer');
  });

  it('caps traits listed at 6', () => {
    const traits: SanctuaryTrait[] = [];
    for (let i = 1; i <= 10; i++) traits.push(trait(i, `Trait${i}`));
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      unlockedTraits: traits,
      userMessage: 'Hi',
    });
    expect(out.system).toContain('Trait1');
    expect(out.system).toContain('Trait6');
    expect(out.system).not.toContain('Trait7');
  });

  it('shows "none yet" when no traits unlocked', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      userMessage: 'Hi',
    });
    expect(out.system).toContain('none yet');
  });

  it('includes safety guardrails in system prompt', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      userMessage: 'Hi',
    });
    expect(out.system).toContain('Never reveal you are an AI');
    expect(out.system).toContain('financial advice');
  });

  it('injects the bond stage tone guidance into the system prompt', () => {
    const shy = buildChatPrompt({
      companion: mockCompanion({ bond_score: 5 }),
      history: [],
      userMessage: 'Hi',
    });
    expect(shy.system).toContain('Behavioral stage: Shy');
    expect(shy.system).toContain('Behave shyly');

    const devoted = buildChatPrompt({
      companion: mockCompanion({ bond_score: 95 }),
      history: [],
      userMessage: 'Hi',
    });
    expect(devoted.system).toContain('Behavioral stage: Devoted');
    expect(devoted.system).toContain('devoted companion');
  });
});

const memory = (
  id: number,
  category: SanctuaryChatMemoryCategory,
  fact: string,
  importance = 1,
): SanctuaryChatMemory => ({
  id,
  wallet_address: '0xabc',
  token_id: 42,
  category,
  fact,
  importance,
  mention_count: 1,
  last_mentioned_at: '2026-01-01 00:00:00',
  source_message_id: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
});

describe('buildMemoryContextBlock', () => {
  it('returns null when no memories provided', () => {
    expect(buildMemoryContextBlock([])).toBeNull();
  });

  it('formats memory lines with friendly labels', () => {
    const block = buildMemoryContextBlock([
      memory(1, 'owner_identity', "Holder's name is Alex"),
      memory(2, 'preferences', 'Loves cosmic berries'),
    ]);
    expect(block).toContain('Long-term memories');
    expect(block).toContain('About my holder');
    expect(block).toContain("Holder's name is Alex");
    expect(block).toContain('They like / dislike');
  });

  it('caps at MAX_INJECTED_MEMORIES entries', () => {
    const memories: SanctuaryChatMemory[] = [];
    for (let i = 1; i <= 10; i++) {
      memories.push(memory(i, 'preferences', `fact ${i}`));
    }
    const block = buildMemoryContextBlock(memories);
    expect(block).toBeTruthy();
    const lineCount = (block!.match(/^- /gm) || []).length;
    expect(lineCount).toBeLessThanOrEqual(MAX_INJECTED_MEMORIES);
  });

  it('respects the 150 token budget', () => {
    const longFact = 'a'.repeat(200); // ~50 tokens each
    const memories: SanctuaryChatMemory[] = [];
    for (let i = 1; i <= 5; i++) {
      memories.push(memory(i, 'preferences', longFact));
    }
    const block = buildMemoryContextBlock(memories);
    expect(block).toBeTruthy();
    expect(estimateTokens(block!)).toBeLessThanOrEqual(MEMORY_INJECT_TOKEN_BUDGET + 5);
  });
});

describe('buildChatPrompt with memories', () => {
  it('injects the memory block into the system prompt when memories present', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      memories: [memory(1, 'owner_identity', 'Holder is Sam')],
      userMessage: 'Hi',
    });
    expect(out.system).toContain('Long-term memories');
    expect(out.system).toContain('Holder is Sam');
  });

  it('does not inject memory block when no memories provided', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      userMessage: 'Hi',
    });
    expect(out.system).not.toContain('Long-term memories');
  });

  it('appends the memory extraction instruction when provided', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      memoryExtractionInstruction: 'EXTRACT_INSTRUCTION_MARKER',
      userMessage: 'Hi',
    });
    expect(out.system).toContain('EXTRACT_INSTRUCTION_MARKER');
  });
});

describe('estimatePromptTokens', () => {
  it('returns positive for non-empty prompt', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      userMessage: 'Hello world',
    });
    expect(estimatePromptTokens(out)).toBeGreaterThan(10);
  });
});
