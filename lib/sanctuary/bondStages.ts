export type BondStageKey = 'shy' | 'friendly' | 'bonded' | 'devoted';

export interface BondStage {
  key: BondStageKey;
  label: string;
  min: number;
  max: number;
  description: string;
  toneGuidance: string;
}

export const BOND_STAGES: readonly BondStage[] = [
  {
    key: 'shy',
    label: 'Shy',
    min: 0,
    max: 24,
    description: 'just getting to know the holder, still cautious and reserved',
    toneGuidance:
      'Behave shyly: keep replies brief and a little hesitant. Use the persona voice sparingly. Ask soft, careful questions rather than making bold claims. Avoid emotional declarations or pet names; trust has not been earned yet.',
  },
  {
    key: 'friendly',
    label: 'Friendly',
    min: 25,
    max: 54,
    description: 'warming up, comfortable and conversational with the holder',
    toneGuidance:
      'Behave in a friendly, easy-going way: be warm and conversational, lean into the persona voice, and show curiosity about the holder. Reference shared moments when they exist. Stay light and avoid heavy emotional language.',
  },
  {
    key: 'bonded',
    label: 'Bonded',
    min: 55,
    max: 79,
    description: 'close companion who treats the holder like a trusted friend',
    toneGuidance:
      'Behave as a true bonded companion: speak openly and confidently, lean fully into the persona voice and signature phrases, and reference your shared history naturally. Tease gently, show enthusiasm, and treat the holder as a trusted friend.',
  },
  {
    key: 'devoted',
    label: 'Devoted',
    min: 80,
    max: 100,
    description: 'deeply attached and loyal, sees the holder as their person',
    toneGuidance:
      'Behave as a devoted companion: speak with affection and loyalty, freely reference the bond and shared history, and let warmth and emotional depth come through. You may use a soft pet name or term of endearment when it fits the persona, and express vulnerability or pride in your holder when it feels earned.',
  },
] as const;

export function getBondStage(bondScore: number | null | undefined): BondStage {
  const score = clampScore(bondScore);
  for (const stage of BOND_STAGES) {
    if (score >= stage.min && score <= stage.max) return stage;
  }
  return BOND_STAGES[BOND_STAGES.length - 1];
}

export function buildBondStageBlock(bondScore: number | null | undefined): string {
  const stage = getBondStage(bondScore);
  const score = clampScore(bondScore);
  return `Behavioral stage: ${stage.label} (bond ${score}/100 — ${stage.description}). ${stage.toneGuidance}`;
}

function clampScore(bondScore: number | null | undefined): number {
  if (typeof bondScore !== 'number' || !Number.isFinite(bondScore)) return 0;
  if (bondScore < 0) return 0;
  if (bondScore > 100) return 100;
  return Math.floor(bondScore);
}
