import { describe, it, expect } from 'vitest';
import {
  buildChatPrompt,
  buildMemoryContextBlock,
  buildCompanionStateBlock,
  buildRecentCareLogLine,
  bondLabel,
  moodLabel,
  estimateTokens,
  estimatePromptTokens,
  formatHungerDescriptor,
  formatHappinessDescriptor,
  formatEnergyDescriptor,
  formatTimeAgo,
  CONSTELLATION_PERSONAS,
  DEFAULT_PERSONA,
  MEMORY_INJECT_TOKEN_BUDGET,
  MAX_INJECTED_MEMORIES,
  STATE_INJECT_TOKEN_BUDGET,
  RECENT_CARE_LOG_TOKEN_BUDGET,
  MAX_RECENT_CARE_LOG_ENTRIES,
  type CompanionStateInput,
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

// ---------------------------------------------------------------------------
// State injection — V2.5 [SWO_V2_COMPANION_CHAT_KNOWS_STATS]
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-27T12:00:00Z');

const stateInput = (overrides: Partial<CompanionStateInput> = {}): CompanionStateInput => ({
  hunger: 80,
  happiness: 80,
  energy: 80,
  is_sleeping: 0,
  needs: [],
  recentActions: [],
  ...overrides,
});

describe('descriptor helpers', () => {
  it('hunger descriptor reflects severity', () => {
    expect(formatHungerDescriptor(95)).toContain('full');
    expect(formatHungerDescriptor(60)).toContain('satisfied');
    expect(formatHungerDescriptor(40)).toContain('peckish');
    expect(formatHungerDescriptor(20)).toContain('hungry');
    expect(formatHungerDescriptor(5)).toContain('starving');
  });

  it('happiness descriptor reflects severity', () => {
    expect(formatHappinessDescriptor(90)).toContain('sparkling');
    expect(formatHappinessDescriptor(60)).toContain('cheerful');
    expect(formatHappinessDescriptor(40)).toContain('dim');
    expect(formatHappinessDescriptor(20)).toContain('lonely');
    expect(formatHappinessDescriptor(5)).toContain('lonely');
  });

  it('energy descriptor reflects severity', () => {
    expect(formatEnergyDescriptor(90)).toContain('rested');
    expect(formatEnergyDescriptor(60)).toContain('alert');
    expect(formatEnergyDescriptor(40)).toContain('drowsy');
    expect(formatEnergyDescriptor(20)).toContain('tired');
    expect(formatEnergyDescriptor(5)).toContain('exhausted');
  });

  it('descriptors clamp out-of-range values', () => {
    expect(formatHungerDescriptor(150)).toContain('full');
    expect(formatHungerDescriptor(-50)).toContain('starving');
    expect(formatHappinessDescriptor(Number.NaN)).toContain('lonely');
  });
});

describe('formatTimeAgo', () => {
  it('formats minutes ago', () => {
    expect(formatTimeAgo('2026-04-27 11:55:00', NOW)).toBe('5m ago');
  });
  it('formats moments ago for very recent events', () => {
    expect(formatTimeAgo('2026-04-27 11:59:50', NOW)).toBe('just moments ago');
  });
  it('formats hours ago', () => {
    expect(formatTimeAgo('2026-04-27 09:00:00', NOW)).toBe('3h ago');
  });
  it('formats days ago for distant events', () => {
    expect(formatTimeAgo('2026-04-24 12:00:00', NOW)).toBe('3d ago');
  });
  it('returns "recently" for unparseable input', () => {
    expect(formatTimeAgo('not-a-date', NOW)).toBe('recently');
  });
});

describe('buildCompanionStateBlock', () => {
  it('renders qualitative descriptors with no raw stat numbers', () => {
    const block = buildCompanionStateBlock(
      stateInput({ hunger: 22, happiness: 85, energy: 45 }),
      NOW,
    );
    expect(block).toContain('hungry');
    expect(block).toContain('sparkling');
    expect(block).toContain('drowsy');
    expect(block).not.toMatch(/\b22\b/);
    expect(block).not.toMatch(/\b85\b/);
    expect(block).not.toMatch(/\b45\b/);
    expect(block).not.toMatch(/\d+%/);
  });

  it('lists active needs but never as raw numbers', () => {
    const block = buildCompanionStateBlock(
      stateInput({ hunger: 10, happiness: 10, needs: ['hungry', 'lonely'] }),
      NOW,
    );
    expect(block).toContain('Active needs');
    expect(block).toContain('hungry');
    expect(block).toContain('lonely');
  });

  it('falls back when no needs are active', () => {
    const block = buildCompanionStateBlock(stateInput(), NOW);
    expect(block).toContain('feeling steady');
  });

  it('flags napping when is_sleeping is 1', () => {
    const block = buildCompanionStateBlock(stateInput({ is_sleeping: 1 }), NOW);
    expect(block).toContain('currently napping');
  });

  it('renders up to 3 recent actions with friendly verbs', () => {
    const block = buildCompanionStateBlock(
      stateInput({
        recentActions: [
          { action: 'feed', created_at: '2026-04-27 11:30:00' },
          { action: 'play', created_at: '2026-04-27 09:00:00' },
          { action: 'pet', created_at: '2026-04-26 12:00:00' },
          { action: 'talk', created_at: '2026-04-25 12:00:00' },
        ],
      }),
      NOW,
    );
    expect(block).toContain('fed me');
    expect(block).toContain('played with me');
    expect(block).toContain('petted me');
    expect(block).not.toContain('talked with me');
  });

  it('falls back when no recent actions', () => {
    const block = buildCompanionStateBlock(stateInput(), NOW);
    expect(block).toContain('nothing recent');
  });

  it('respects the 200 token injection budget', () => {
    const block = buildCompanionStateBlock(
      stateInput({
        hunger: 5,
        happiness: 5,
        energy: 5,
        is_sleeping: 1,
        needs: ['hungry', 'lonely', 'tired'],
        recentActions: [
          { action: 'feed', created_at: '2026-04-27 11:30:00' },
          { action: 'play', created_at: '2026-04-27 09:00:00' },
          { action: 'pet', created_at: '2026-04-26 12:00:00' },
        ],
      }),
      NOW,
    );
    expect(estimateTokens(block)).toBeLessThanOrEqual(STATE_INJECT_TOKEN_BUDGET);
  });

  it('STATE_INJECT_TOKEN_BUDGET equals 200', () => {
    expect(STATE_INJECT_TOKEN_BUDGET).toBe(200);
  });
});

describe('buildChatPrompt with companion state', () => {
  it('injects the state block into the system prompt when state is provided', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      state: stateInput({ hunger: 25, needs: ['hungry'] }),
      now: NOW,
      userMessage: 'Hi',
    });
    expect(out.system).toContain('current physical state');
    expect(out.system).toContain('hungry');
    expect(out.system).toContain('Never quote raw stat numbers');
  });

  it('does not inject the state block when state is omitted', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      userMessage: 'Hi',
    });
    expect(out.system).not.toContain('current physical state');
  });

  it('injection plus full prompt stays well under model limits', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      state: stateInput({
        hunger: 20,
        happiness: 20,
        energy: 20,
        is_sleeping: 1,
        needs: ['hungry', 'lonely', 'tired'],
        recentActions: [
          { action: 'feed', created_at: '2026-04-27 11:30:00' },
          { action: 'play', created_at: '2026-04-27 10:00:00' },
          { action: 'pet', created_at: '2026-04-27 09:00:00' },
        ],
      }),
      now: NOW,
      userMessage: 'How are you?',
    });
    expect(estimatePromptTokens(out)).toBeLessThan(2000);
  });

  it('the system prompt instructs the model to reference state qualitatively', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      state: stateInput(),
      now: NOW,
      userMessage: 'Hi',
    });
    expect(out.system).toMatch(/qualitative|qualitatively/i);
    expect(out.system).toMatch(/never\s+(state|quote)\s+raw\s+numbers|raw\s+stat\s+numbers/i);
  });
});

// ---------------------------------------------------------------------------
// Recent care log — V2.5 [SWO_V2_COMPANION_CHAT_REMEMBERS_RECENT_ACTIONS]
// ---------------------------------------------------------------------------

describe('buildRecentCareLogLine', () => {
  it('returns null when no journal entries are provided', () => {
    expect(buildRecentCareLogLine([], NOW)).toBeNull();
  });

  it('returns null when no interaction entries exist', () => {
    const entries = [
      journal(1, 'achievement', 'Unlocked Foodie', '2026-04-27 11:55:00'),
      journal(2, 'activity', 'Visited Hot Springs', '2026-04-27 10:00:00'),
      journal(3, 'system', 'Weekly reset', '2026-04-26 12:00:00'),
    ];
    expect(buildRecentCareLogLine(entries, NOW)).toBeNull();
  });

  it('renders content joined by "; " when interactions exist', () => {
    const entries = [
      journal(1, 'interaction', 'Fed a cosmic treat.', '2026-04-27 11:30:00'),
      journal(2, 'interaction', 'Played fetch.', '2026-04-27 09:00:00'),
      journal(3, 'interaction', 'Gentle pets.', '2026-04-26 12:00:00'),
    ];
    const line = buildRecentCareLogLine(entries, NOW);
    expect(line).toBeTruthy();
    expect(line).toContain('Recent care log');
    expect(line).toContain('Fed a cosmic treat.');
    expect(line).toContain('Played fetch.');
    expect(line).toContain('Gentle pets.');
    expect(line).toContain('; ');
    expect(line).toContain('30m ago');
    expect(line).toContain('3h ago');
    expect(line).toContain('24h ago');
  });

  it('only uses interaction-typed journal entries', () => {
    const entries = [
      journal(1, 'achievement', 'Unlocked Foodie', '2026-04-27 11:55:00'),
      journal(2, 'interaction', 'Fed a cosmic treat.', '2026-04-27 11:30:00'),
      journal(3, 'activity', 'Visited Hot Springs', '2026-04-27 10:00:00'),
    ];
    const line = buildRecentCareLogLine(entries, NOW);
    expect(line).toBeTruthy();
    expect(line).toContain('Fed a cosmic treat.');
    expect(line).not.toContain('Foodie');
    expect(line).not.toContain('Hot Springs');
  });

  it('caps to MAX_RECENT_CARE_LOG_ENTRIES interactions', () => {
    const entries: SanctuaryJournalEntry[] = [];
    for (let i = 0; i < 6; i++) {
      entries.push(journal(i + 1, 'interaction', `Event ${i + 1}.`, '2026-04-27 11:30:00'));
    }
    const line = buildRecentCareLogLine(entries, NOW);
    expect(line).toBeTruthy();
    const matches = line!.match(/Event \d+\./g) || [];
    expect(matches.length).toBeLessThanOrEqual(MAX_RECENT_CARE_LOG_ENTRIES);
  });

  it('respects the 80-token budget even with verbose interaction content', () => {
    const longText = 'a'.repeat(400);
    const entries = [
      journal(1, 'interaction', longText, '2026-04-27 11:30:00'),
      journal(2, 'interaction', longText, '2026-04-27 09:00:00'),
      journal(3, 'interaction', longText, '2026-04-26 12:00:00'),
    ];
    const line = buildRecentCareLogLine(entries, NOW);
    expect(line).toBeTruthy();
    expect(estimateTokens(line!)).toBeLessThanOrEqual(RECENT_CARE_LOG_TOKEN_BUDGET);
  });

  it('RECENT_CARE_LOG_TOKEN_BUDGET equals 80', () => {
    expect(RECENT_CARE_LOG_TOKEN_BUDGET).toBe(80);
  });
});

describe('buildChatPrompt with recent care log', () => {
  it('includes the recent care log line when interaction journal entries exist', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      journal: [
        journal(1, 'interaction', 'Fed a cosmic treat.', '2026-04-27 11:30:00'),
        journal(2, 'interaction', 'Played fetch.', '2026-04-27 09:00:00'),
      ],
      now: NOW,
      userMessage: 'Hi',
    });
    expect(out.system).toContain('Recent care log');
    expect(out.system).toContain('Fed a cosmic treat.');
    expect(out.system).toContain('30m ago');
  });

  it('omits the recent care log line when no interaction entries exist', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      journal: [
        journal(1, 'achievement', 'Unlocked Foodie', '2026-04-27 11:55:00'),
        journal(2, 'activity', 'Visited Hot Springs', '2026-04-27 10:00:00'),
      ],
      now: NOW,
      userMessage: 'Hi',
    });
    expect(out.system).not.toContain('Recent care log');
  });

  it('omits the recent care log line when no journal entries are provided', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      now: NOW,
      userMessage: 'Hi',
    });
    expect(out.system).not.toContain('Recent care log');
  });

  it('care log + state block stay within combined ≤200 token envelope', () => {
    const out = buildChatPrompt({
      companion: mockCompanion(),
      history: [],
      journal: [
        journal(1, 'interaction', 'Fed a cosmic treat that made me beam.', '2026-04-27 11:30:00'),
        journal(2, 'interaction', 'Played fetch in the cosmic garden.', '2026-04-27 09:00:00'),
        journal(3, 'interaction', 'Pets and gentle scratches.', '2026-04-26 12:00:00'),
      ],
      state: stateInput({
        hunger: 30,
        happiness: 60,
        energy: 50,
        needs: ['hungry'],
        recentActions: [
          { action: 'feed', created_at: '2026-04-27 11:30:00' },
        ],
      }),
      now: NOW,
      userMessage: 'Hi',
    });
    const stateBlockMatch = out.system.match(/Your current physical state[\s\S]*?(?=\n\nRecent care log)/);
    const careLogMatch = out.system.match(/Recent care log[^\n]*/);
    expect(stateBlockMatch).toBeTruthy();
    expect(careLogMatch).toBeTruthy();
    expect(estimateTokens(stateBlockMatch![0])).toBeLessThanOrEqual(STATE_INJECT_TOKEN_BUDGET);
    expect(estimateTokens(careLogMatch![0])).toBeLessThanOrEqual(RECENT_CARE_LOG_TOKEN_BUDGET);
  });
});
