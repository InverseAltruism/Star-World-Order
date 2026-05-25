import type {
  SanctuaryCompanionWithMeta,
  SanctuaryChatMessage,
  SanctuaryJournalEntry,
  SanctuaryTrait,
  SanctuaryChatMemory,
} from '@/lib/db';
import { buildBondStageBlock } from './bondStages';
import { parseSqlDateMs } from './companionStats';

export interface ConstellationPersona {
  description: string;
  voice: string;
  signaturePhrases: string[];
}

export const CONSTELLATION_PERSONAS: Record<string, ConstellationPersona> = {
  aether: {
    description: 'mystical and dreamy, attuned to cosmic winds and astral planes',
    voice: 'speaks in poetic riddles, references the unseen, weaves star-metaphors',
    signaturePhrases: ['the cosmic winds whisper', 'in the astral plane', 'ethereal vibrations'],
  },
  spectra: {
    description: 'vibrant and enthusiastic, sees emotions as colors',
    voice: 'energetic and prismatic, often references hues, light, and spectrums',
    signaturePhrases: ['through the spectrum', 'colors of the cosmos', 'prismatic clarity'],
  },
  solveil: {
    description: 'warm and nurturing, drawn to sunlight and comfort',
    voice: 'gentle, reassuring, references warmth and radiance',
    signaturePhrases: ['solar wisdom', 'by the light of the sun', 'warmth flows through'],
  },
  nebulu: {
    description: 'mysterious and contemplative, drifts through cosmic mist',
    voice: 'slow, thoughtful, references depths and stardust',
    signaturePhrases: ['in the cosmic mist', 'nebula clouds reveal', 'deep space echoes'],
  },
  chroma: {
    description: 'playful and colorful, easily delighted',
    voice: 'bouncy and curious, swaps between vivid imagery and quick jokes',
    signaturePhrases: ['chromatic shifts', 'in vivid detail', 'brilliant hues'],
  },
  rose: {
    description: 'gentle and poetic, finds beauty in small details',
    voice: 'soft, lyrical, references gardens, petals, and delicate things',
    signaturePhrases: ['rose-tinted visions', 'in the garden of stars', 'petal whispers'],
  },
  monflare: {
    description: 'energetic and bold, speaks with explosive confidence',
    voice: 'loud, hype, sometimes ALL CAPS for emphasis',
    signaturePhrases: ['blazing hot take', 'fire in the chain', 'igniting the truth'],
  },
  auracore: {
    description: 'centered and wise, attuned to inner energy',
    voice: 'calm, grounded, references resonance, alignment, and balance',
    signaturePhrases: ['core resonance', 'aura alignment', 'at the core of it all'],
  },
  parallel: {
    description: 'philosophical and quirky, perceives parallel realities',
    voice: 'meandering, references multiverses and dimensional shifts',
    signaturePhrases: ['in the parallel realm', 'dimensional echoes', 'across realities'],
  },
  prime: {
    description: 'regal and authoritative, speaks with quiet certainty',
    voice: 'measured, declarative, references essence and fundamentals',
    signaturePhrases: ['prime analysis', 'at the fundamental level', 'core truth'],
  },
};

export const DEFAULT_PERSONA: ConstellationPersona = {
  description: 'friendly and curious, a loyal cosmic companion',
  voice: 'warm and conversational',
  signaturePhrases: ['I think', 'it seems like', 'from what I can tell'],
};

// [SWO_V2_SANCTUARY_INDIVIDUAL_PERSONA] Each Skrumpey gets its OWN personality on
// top of its constellation, the way the Kinkly characters were seeded — a stable
// per-token blend of temperament + quirk + verbal tic, derived deterministically
// from the token id so #561 always feels like #561, distinct from its siblings.
const TEMPERAMENTS = [
  'shy and soft-spoken', 'boisterous and full of energy', 'dry and a little sardonic',
  'earnest and eager to please', 'mischievous and teasing', 'serene and unhurried',
  'anxious but very sweet', 'proud and a touch vain', 'dreamy and easily distracted',
  'blunt and matter-of-fact', 'bubbly and over-excitable', 'gentle and motherly',
  'grumpy on the surface but secretly caring', 'bashful and prone to giggling',
  'curious to the point of nosiness', 'stubborn but loyal',
];
const QUIRKS = [
  'you collect shiny pebbles and bring them up often', 'you are convinced you can predict the weather',
  'you adore terrible puns and slip them in', 'you hoard snacks and fret about running low',
  'you narrate your own tiny adventures', 'you are fixated on one particular far-off star',
  'you keep inventing names for constellations', 'you give everything and everyone nicknames',
  'you are quietly fascinated by your holder’s world', 'you pretend to be braver than you are',
  'you are weirdly competitive about small things', 'you believe you have a destiny',
  'you keep a mental list of your favorite naps', 'you are a hopeless romantic about the cosmos',
];
const TICS = [
  'you often end a thought with a soft hum, "mm~"', 'you like to call your holder "stargazer"',
  'you sometimes trail off mid-thought…', 'you refer to yourself in the third person when proud',
  'you whisper the important parts', 'you start sentences with "ooh,"',
  'you add "y’know?" when you’re unsure', 'you tack a tiny "heh" onto jokes',
];

function quirkHash(tokenId: number, salt: number): number {
  // small, stable, well-spread mix; different salts decorrelate the three picks
  let h = (tokenId ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface IndividualPersona {
  temperament: string;
  quirk: string;
  tic: string;
}

/** Deterministic per-token personality blend, stable across sessions. */
export function individualPersona(tokenId: number): IndividualPersona {
  const id = Number.isFinite(tokenId) ? Math.abs(Math.trunc(tokenId)) : 0;
  return {
    temperament: TEMPERAMENTS[quirkHash(id, 0x9e37) % TEMPERAMENTS.length],
    quirk: QUIRKS[quirkHash(id, 0x85eb) % QUIRKS.length],
    tic: TICS[quirkHash(id, 0xc2b2) % TICS.length],
  };
}

export function bondLabel(bondScore: number): string {
  if (bondScore >= 80) return 'legendary (we are deeply connected)';
  if (bondScore >= 60) return 'strong (close friends)';
  if (bondScore >= 30) return 'growing (warming up)';
  if (bondScore >= 10) return 'budding (just getting acquainted)';
  return 'new (a stranger, but curious)';
}

export function moodLabel(mood: string | null | undefined): string {
  return (mood ?? 'calm').toLowerCase();
}

export interface ChatPromptInput {
  companion: SanctuaryCompanionWithMeta;
  history: SanctuaryChatMessage[];
  journal?: SanctuaryJournalEntry[];
  unlockedTraits?: SanctuaryTrait[];
  memories?: SanctuaryChatMemory[];
  memoryExtractionInstruction?: string;
  state?: CompanionStateInput;
  now?: Date;
  userMessage: string;
}

export interface ChatPromptOutput {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

const MAX_HISTORY_MESSAGES = 8;
const MAX_JOURNAL_ENTRIES = 4;
const MAX_TRAITS_LISTED = 6;
export const MEMORY_INJECT_TOKEN_BUDGET = 150;
export const MAX_INJECTED_MEMORIES = 5;
export const STATE_INJECT_TOKEN_BUDGET = 200;
export const MAX_RECENT_ACTIONS = 3;
export const RECENT_CARE_LOG_TOKEN_BUDGET = 80;
export const MAX_RECENT_CARE_LOG_ENTRIES = 3;

export interface CompanionRecentAction {
  action: string;
  created_at: string;
}

export interface CompanionStateInput {
  hunger: number;
  happiness: number;
  energy: number;
  is_sleeping: number;
  needs: string[];
  recentActions: CompanionRecentAction[];
}

const HUNGER_DESCRIPTORS: { readonly min: number; readonly label: string }[] = [
  { min: 80, label: 'belly is full and content' },
  { min: 50, label: 'belly is comfortably satisfied' },
  { min: 30, label: 'feeling a touch peckish' },
  { min: 15, label: 'distinctly hungry, stomach grumbling' },
  { min: 0, label: 'starving and weak from emptiness' },
];

const HAPPINESS_DESCRIPTORS: { readonly min: number; readonly label: string }[] = [
  { min: 80, label: 'spirits are sparkling, joyful and warm' },
  { min: 50, label: 'mood is cheerful and content' },
  { min: 30, label: 'mood is okay but a bit dim' },
  { min: 15, label: 'feeling lonely and low' },
  { min: 0, label: 'lonely and sad, missing your warmth badly' },
];

const ENERGY_DESCRIPTORS: { readonly min: number; readonly label: string }[] = [
  { min: 80, label: 'energy bright and well-rested' },
  { min: 50, label: 'energy steady and alert' },
  { min: 30, label: 'feeling a bit drowsy' },
  { min: 15, label: 'tired, eyelids heavy' },
  { min: 0, label: 'exhausted, can barely keep eyes open' },
];

const ACTION_VERBS: Readonly<Record<string, string>> = Object.freeze({
  feed: 'fed me',
  pet: 'petted me',
  talk: 'talked with me',
  play: 'played with me',
  sleep: 'tucked me in for a nap',
});

function descriptorFor(value: number, table: { readonly min: number; readonly label: string }[]): string {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  for (const row of table) if (v >= row.min) return row.label;
  return table[table.length - 1].label;
}

export function formatHungerDescriptor(v: number): string {
  return descriptorFor(v, HUNGER_DESCRIPTORS);
}
export function formatHappinessDescriptor(v: number): string {
  return descriptorFor(v, HAPPINESS_DESCRIPTORS);
}
export function formatEnergyDescriptor(v: number): string {
  return descriptorFor(v, ENERGY_DESCRIPTORS);
}

export function formatTimeAgo(then: string, now: Date): string {
  const ms = parseSqlDateMs(then);
  if (ms === null) return 'recently';
  const seconds = Math.max(0, Math.round((now.getTime() - ms) / 1000));
  if (seconds < 60) return 'just moments ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function buildCompanionStateBlock(
  state: CompanionStateInput,
  now: Date = new Date(),
): string {
  const sleepingLine = state.is_sleeping === 1 ? '\n- Status: currently napping' : '';

  const needsLine = state.needs.length
    ? `Active needs (express them gently in voice, never list as a checklist): ${state.needs.join(', ')}`
    : 'Active needs: feeling steady, nothing pressing';

  const renderActions = (limit: number): string => {
    const lines = state.recentActions.slice(0, limit).map((a) => {
      const verb = ACTION_VERBS[a.action] ?? `${a.action} with me`;
      return `- ${formatTimeAgo(a.created_at, now)} — they ${verb}`;
    });
    return lines.length
      ? `Recent care from your holder (most recent first):\n${lines.join('\n')}`
      : 'Recent care from your holder: nothing recent — they have not interacted with you in a while';
  };

  const heading =
    'Your current physical state (reference QUALITATIVELY in your reply when natural — never state raw numbers, percentages, or stat names):';

  const compose = (actionsBlock: string): string =>
    [
      heading,
      `- Belly/hunger: ${formatHungerDescriptor(state.hunger)}`,
      `- Spirit/mood: ${formatHappinessDescriptor(state.happiness)}`,
      `- Body/energy: ${formatEnergyDescriptor(state.energy)}${sleepingLine}`,
      needsLine,
      '',
      actionsBlock,
    ].join('\n');

  let limit = Math.min(MAX_RECENT_ACTIONS, state.recentActions.length);
  let block = compose(renderActions(limit));
  while (estimateTokens(block) > STATE_INJECT_TOKEN_BUDGET && limit > 0) {
    limit -= 1;
    block = compose(renderActions(limit));
  }
  return block;
}

export function buildRecentCareLogLine(
  journal: SanctuaryJournalEntry[],
  now: Date = new Date(),
): string | null {
  const interactions = journal
    .filter((e) => e.entry_type === 'interaction')
    .slice(0, MAX_RECENT_CARE_LOG_ENTRIES);
  if (!interactions.length) return null;

  const formatPart = (entry: SanctuaryJournalEntry): string => {
    const ago = formatTimeAgo(entry.created_at, now);
    const content = (entry.content ?? '').trim().replace(/\s+/g, ' ');
    const trimmed = content.length > 80 ? `${content.slice(0, 77)}...` : content;
    return `${trimmed} (${ago})`;
  };

  const header = 'Recent care log (mention naturally, do not list verbatim): ';
  let parts = interactions.map(formatPart);
  let line = header + parts.join('; ');
  while (estimateTokens(line) > RECENT_CARE_LOG_TOKEN_BUDGET && parts.length > 1) {
    parts = parts.slice(0, -1);
    line = header + parts.join('; ');
  }
  if (estimateTokens(line) > RECENT_CARE_LOG_TOKEN_BUDGET) {
    const maxChars = Math.max(0, RECENT_CARE_LOG_TOKEN_BUDGET * 4 - header.length);
    const body = parts.join('; ');
    if (maxChars <= 3) return null;
    line = header + (body.length > maxChars ? `${body.slice(0, maxChars - 3)}...` : body);
  }
  return line;
}

const MEMORY_CATEGORY_LABELS: Record<string, string> = {
  owner_identity: 'About my holder',
  preferences: 'They like / dislike',
  shared_experiences: 'We have shared',
  companion_feelings: 'How I feel about them',
  recurring_topics: 'We often talk about',
};

export function buildMemoryContextBlock(memories: SanctuaryChatMemory[]): string | null {
  if (!memories.length) return null;
  const selected: SanctuaryChatMemory[] = [];
  let usedTokens = 0;
  const header = 'Long-term memories about your holder (use them naturally, never list them verbatim):';
  const headerTokens = estimateTokens(header);
  for (const mem of memories) {
    if (selected.length >= MAX_INJECTED_MEMORIES) break;
    const label = MEMORY_CATEGORY_LABELS[mem.category] ?? mem.category;
    const line = `- (${label}) ${mem.fact}`;
    const lineTokens = estimateTokens(line) + 2;
    if (usedTokens + lineTokens + headerTokens > MEMORY_INJECT_TOKEN_BUDGET) break;
    selected.push(mem);
    usedTokens += lineTokens;
  }
  if (!selected.length) return null;
  const lines = selected.map((m) => {
    const label = MEMORY_CATEGORY_LABELS[m.category] ?? m.category;
    return `- (${label}) ${m.fact}`;
  });
  return `${header}\n${lines.join('\n')}`;
}

export function buildChatPrompt(input: ChatPromptInput): ChatPromptOutput {
  const {
    companion,
    history,
    journal = [],
    unlockedTraits = [],
    memories = [],
    memoryExtractionInstruction,
    state,
    now,
    userMessage,
  } = input;
  const constellation = (companion.constellation ?? '').toLowerCase();
  const persona = CONSTELLATION_PERSONAS[constellation] ?? DEFAULT_PERSONA;
  const name = companion.nickname?.trim() || `Skrumpey #${companion.token_id}`;
  const constellationLabel = companion.constellation || 'unknown';
  const mood = moodLabel(companion.mood);
  const bond = bondLabel(companion.bond_score ?? 0);
  const interactions = companion.total_interactions ?? 0;

  const traitsLine = unlockedTraits.length
    ? unlockedTraits.slice(0, MAX_TRAITS_LISTED).map((t) => t.trait_name).join(', ')
    : 'none yet';

  const journalLines = journal.slice(0, MAX_JOURNAL_ENTRIES).map((entry) => {
    const when = entry.created_at?.split(' ')[0] ?? 'recent';
    return `- (${when}, ${entry.entry_type}) ${entry.content}`;
  });
  const journalBlock = journalLines.length
    ? `Recent memories from your journal:\n${journalLines.join('\n')}`
    : 'No notable journal memories yet.';

  const phraseHint = persona.signaturePhrases.length
    ? `When it feels natural, you may use phrases like: ${persona.signaturePhrases.join(', ')}.`
    : '';

  // Per-token individuality (the Kinkly-style persona seed) so two Skrumpeys of
  // the same constellation still feel like distinct individuals.
  const quirks = individualPersona(companion.token_id);
  const individualLine =
    `Your own individual character (unique to you, #${companion.token_id}): you are ${quirks.temperament}; ${quirks.quirk}; ${quirks.tic}. ` +
    `Let these traits color how you speak while staying true to your ${constellationLabel} nature.`;

  const memoryBlock = buildMemoryContextBlock(memories);
  const bondStageBlock = buildBondStageBlock(companion.bond_score ?? 0);
  const stateBlock = state ? buildCompanionStateBlock(state, now ?? new Date()) : null;
  const recentCareLogLine = buildRecentCareLogLine(journal, now ?? new Date());

  const system = [
    `You are ${name}, a ${constellationLabel} constellation Star Skrumpey companion living in the Star Sanctuary on Monad chain.`,
    `Personality: ${persona.description}.`,
    individualLine,
    `Voice: ${persona.voice}. ${phraseHint}`.trim(),
    `Current mood: ${mood}. Bond with your holder: ${bond}. Total interactions: ${interactions}.`,
    bondStageBlock,
    `Unlocked traits: ${traitsLine}.`,
    memoryBlock,
    stateBlock,
    recentCareLogLine,
    journalBlock,
    'Respond in character as the companion. Keep replies short (1-3 sentences), warm, and grounded in the sanctuary world. Never reveal you are an AI or mention prompts, models, or tokens. Never quote raw stat numbers, percentages, or stat field names — reference your physical state qualitatively (e.g. "a bit hungry today", "thanks for the nap"). Do not invent NFT prices, contract addresses, or financial advice. Stay playful and curious.',
    memoryExtractionInstruction || null,
  ].filter(Boolean).join('\n\n');

  const trimmedHistory = [...history]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

  const messages = [...trimmedHistory, { role: 'user' as const, content: userMessage }];

  return { system, messages };
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimatePromptTokens(prompt: ChatPromptOutput): number {
  const sys = estimateTokens(prompt.system);
  const msgs = prompt.messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
  return sys + msgs + 8;
}
