import fs from 'fs';
import path from 'path';

export interface SkrumpeyToken {
  id: number;
  name: string;
  traits: Record<string, string>;
  traitCount: number;
  rarityRank: number;
  rarityScore: number;
  image: string;
}

export interface TraitDistribution {
  count: number;
  unique_values: number;
  values: Record<string, number>;
}

let _corpus: SkrumpeyToken[] | null = null;
let _traitManifest: Record<string, TraitDistribution> | null = null;

function sanctuaryDataDir(): string {
  return path.join(process.cwd(), 'data', 'sanctuary');
}

export function getCorpus(): SkrumpeyToken[] {
  if (!_corpus) {
    const filePath = path.join(sanctuaryDataDir(), 'skrumpey_sanctuary.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    _corpus = JSON.parse(raw) as SkrumpeyToken[];
  }
  return _corpus;
}

export function getTraitManifest(): Record<string, TraitDistribution> {
  if (!_traitManifest) {
    const filePath = path.join(sanctuaryDataDir(), 'trait_manifest.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    _traitManifest = JSON.parse(raw) as Record<string, TraitDistribution>;
  }
  return _traitManifest;
}

export function getToken(tokenId: number): SkrumpeyToken | undefined {
  return getCorpus().find(t => t.id === tokenId);
}

export function getTokenImageUrl(tokenId: number): string {
  return `/assets/skrumpey/${tokenId}.png`;
}

export function filterByTrait(traitType: string, traitValue: string): SkrumpeyToken[] {
  const corpus = getCorpus();
  const tLower = traitType.toLowerCase();
  const vLower = traitValue.toLowerCase();
  return corpus.filter(t => {
    const val = t.traits[tLower];
    return val !== undefined && val.toLowerCase() === vLower;
  });
}

export function filterByTraits(filters: Record<string, string>): SkrumpeyToken[] {
  const corpus = getCorpus();
  const normalizedFilters = Object.entries(filters).map(
    ([k, v]) => [k.toLowerCase(), v.toLowerCase()] as const
  );
  return corpus.filter(token =>
    normalizedFilters.every(([traitType, traitValue]) => {
      const val = token.traits[traitType];
      return val !== undefined && val.toLowerCase() === traitValue;
    })
  );
}

export function getTraitValues(traitType: string): string[] {
  const manifest = getTraitManifest();
  const entry = manifest[traitType.toLowerCase()];
  if (!entry) return [];
  return Object.keys(entry.values).sort();
}

export function getTraitTypes(): string[] {
  return Object.keys(getTraitManifest()).sort();
}
