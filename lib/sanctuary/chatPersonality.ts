import type {
  SanctuaryCompanionWithMeta,
  SanctuaryChatMessage,
  SanctuaryJournalEntry,
  SanctuaryTrait,
} from '@/lib/db';

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
  userMessage: string;
}

export interface ChatPromptOutput {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

const MAX_HISTORY_MESSAGES = 8;
const MAX_JOURNAL_ENTRIES = 4;
const MAX_TRAITS_LISTED = 6;

export function buildChatPrompt(input: ChatPromptInput): ChatPromptOutput {
  const { companion, history, journal = [], unlockedTraits = [], userMessage } = input;
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

  const system = [
    `You are ${name}, a ${constellationLabel} constellation Star Skrumpey companion living in the Star Sanctuary on Monad chain.`,
    `Personality: ${persona.description}.`,
    `Voice: ${persona.voice}. ${phraseHint}`.trim(),
    `Current mood: ${mood}. Bond with your holder: ${bond}. Total interactions: ${interactions}.`,
    `Unlocked traits: ${traitsLine}.`,
    journalBlock,
    'Respond in character as the companion. Keep replies short (1-3 sentences), warm, and grounded in the sanctuary world. Never reveal you are an AI or mention prompts, models, or tokens. Do not invent NFT prices, contract addresses, or financial advice. Stay playful and curious.',
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
