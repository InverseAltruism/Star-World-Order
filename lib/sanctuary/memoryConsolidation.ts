import type {
  ApplyConsolidationPlan,
  ApplyConsolidationResult,
  CompanionMemoryOwner,
  SanctuaryChatMemory,
  SanctuaryChatMemoryCategory,
} from '@/lib/db';
import {
  applyMemoryConsolidationPlan,
  getAllChatMemoriesForCompanion,
  listCompanionMemoryOwners,
} from '@/lib/db';

export interface MergeAction {
  category: SanctuaryChatMemoryCategory;
  keepId: number;
  removeIds: number[];
  newFact: string;
  newImportance: number;
  newMentionCount: number;
}

export interface DecayAction {
  id: number;
  oldImportance: number;
  newImportance: number;
}

export interface ConsolidationPlan {
  merges: MergeAction[];
  decays: DecayAction[];
}

export interface ConsolidationOptions {
  duplicateSimilarityThreshold?: number;
  topicClusterThreshold?: number;
  feelingDecayAfterDays?: number;
  now?: number;
}

export interface ConsolidationDefaults {
  duplicateSimilarityThreshold: number;
  topicClusterThreshold: number;
  feelingDecayAfterDays: number;
}

export const CONSOLIDATION_DEFAULTS: ConsolidationDefaults = {
  duplicateSimilarityThreshold: 0.85,
  topicClusterThreshold: 0.5,
  feelingDecayAfterDays: 14,
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'i', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their',
  'they', 'them', 'this', 'to', 'was', 'were', 'with', 'we', 'us',
]);

export function normalizeFactText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeFact(s: string): string[] {
  const norm = normalizeFactText(s);
  if (!norm) return [];
  return norm.split(' ').filter((tok) => tok.length > 1 && !STOP_WORDS.has(tok));
}

export function jaccardSimilarity(a: string, b: string): number {
  const ta = new Set(tokenizeFact(a));
  const tb = new Set(tokenizeFact(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const tok of ta) if (tb.has(tok)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function pickKeeper(cluster: SanctuaryChatMemory[]): SanctuaryChatMemory {
  return cluster.reduce((best, m) => {
    if (m.importance !== best.importance) {
      return m.importance > best.importance ? m : best;
    }
    if (m.mention_count !== best.mention_count) {
      return m.mention_count > best.mention_count ? m : best;
    }
    return new Date(m.last_mentioned_at) > new Date(best.last_mentioned_at) ? m : best;
  }, cluster[0]);
}

function clusterByCategory(
  memories: SanctuaryChatMemory[],
  threshold: number,
): SanctuaryChatMemory[][] {
  const sorted = [...memories].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return b.mention_count - a.mention_count;
  });
  const used = new Set<number>();
  const clusters: SanctuaryChatMemory[][] = [];
  for (const seed of sorted) {
    if (used.has(seed.id)) continue;
    const cluster: SanctuaryChatMemory[] = [seed];
    used.add(seed.id);
    for (const candidate of sorted) {
      if (used.has(candidate.id)) continue;
      if (jaccardSimilarity(seed.fact, candidate.fact) >= threshold) {
        cluster.push(candidate);
        used.add(candidate.id);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function mergeCluster(
  cluster: SanctuaryChatMemory[],
  category: SanctuaryChatMemoryCategory,
): MergeAction | null {
  if (cluster.length < 2) return null;
  const keeper = pickKeeper(cluster);
  const removeIds = cluster.filter((m) => m.id !== keeper.id).map((m) => m.id);
  const newImportance = cluster.reduce((max, m) => Math.max(max, m.importance), 1);
  const newMentionCount = cluster.reduce((sum, m) => sum + m.mention_count, 0);
  return {
    category,
    keepId: keeper.id,
    removeIds,
    newFact: keeper.fact,
    newImportance: Math.max(1, Math.min(5, newImportance)),
    newMentionCount,
  };
}

function planMerges(
  memories: SanctuaryChatMemory[],
  options: Required<Pick<ConsolidationOptions, 'duplicateSimilarityThreshold' | 'topicClusterThreshold'>>,
): MergeAction[] {
  const byCategory = new Map<SanctuaryChatMemoryCategory, SanctuaryChatMemory[]>();
  for (const m of memories) {
    const arr = byCategory.get(m.category) ?? [];
    arr.push(m);
    byCategory.set(m.category, arr);
  }
  const merges: MergeAction[] = [];
  for (const [category, items] of byCategory.entries()) {
    const threshold =
      category === 'recurring_topics'
        ? options.topicClusterThreshold
        : options.duplicateSimilarityThreshold;
    const clusters = clusterByCategory(items, threshold);
    for (const cluster of clusters) {
      const merge = mergeCluster(cluster, category);
      if (merge) merges.push(merge);
    }
  }
  return merges;
}

function planDecays(
  memories: SanctuaryChatMemory[],
  feelingDecayAfterDays: number,
  nowMs: number,
): DecayAction[] {
  const cutoff = nowMs - feelingDecayAfterDays * 24 * 60 * 60 * 1000;
  const decays: DecayAction[] = [];
  for (const m of memories) {
    if (m.category !== 'companion_feelings') continue;
    if (m.importance <= 1) continue;
    const lastMs = Date.parse(m.last_mentioned_at);
    if (!Number.isFinite(lastMs)) continue;
    if (lastMs > cutoff) continue;
    decays.push({
      id: m.id,
      oldImportance: m.importance,
      newImportance: Math.max(1, m.importance - 1),
    });
  }
  return decays;
}

export function planConsolidation(
  memories: SanctuaryChatMemory[],
  options: ConsolidationOptions = {},
): ConsolidationPlan {
  const opts = {
    duplicateSimilarityThreshold:
      options.duplicateSimilarityThreshold ?? CONSOLIDATION_DEFAULTS.duplicateSimilarityThreshold,
    topicClusterThreshold:
      options.topicClusterThreshold ?? CONSOLIDATION_DEFAULTS.topicClusterThreshold,
    feelingDecayAfterDays:
      options.feelingDecayAfterDays ?? CONSOLIDATION_DEFAULTS.feelingDecayAfterDays,
    now: options.now ?? Date.now(),
  };
  const merges = planMerges(memories, opts);
  const mergedAwayIds = new Set(merges.flatMap((m) => m.removeIds));
  const survivors = memories.filter((m) => !mergedAwayIds.has(m.id));
  const decays = planDecays(survivors, opts.feelingDecayAfterDays, opts.now);
  return { merges, decays };
}

export interface ConsolidationStats {
  companionsScanned: number;
  memoriesScanned: number;
  merged: number;
  decayed: number;
}

export function summarizePlan(plan: ConsolidationPlan): { merged: number; decayed: number } {
  const merged = plan.merges.reduce((sum, m) => sum + m.removeIds.length, 0);
  const decayed = plan.decays.length;
  return { merged, decayed };
}

export function toApplyPlan(plan: ConsolidationPlan): ApplyConsolidationPlan {
  return {
    merges: plan.merges.map((m) => ({
      keepId: m.keepId,
      removeIds: m.removeIds,
      newImportance: m.newImportance,
      newMentionCount: m.newMentionCount,
    })),
    decays: plan.decays.map((d) => ({ id: d.id, newImportance: d.newImportance })),
  };
}

export function consolidateCompanionMemories(
  owner: CompanionMemoryOwner,
  options: ConsolidationOptions = {},
): ApplyConsolidationResult & { companionsScanned: number; memoriesScanned: number } {
  const memories = getAllChatMemoriesForCompanion(owner.wallet_address, owner.token_id);
  const plan = planConsolidation(memories, options);
  const result = applyMemoryConsolidationPlan(toApplyPlan(plan));
  return {
    companionsScanned: 1,
    memoriesScanned: memories.length,
    merged: result.merged,
    decayed: result.decayed,
  };
}

export function consolidateAllCompanionMemories(
  options: ConsolidationOptions = {},
): ConsolidationStats {
  const owners = listCompanionMemoryOwners();
  const stats: ConsolidationStats = {
    companionsScanned: 0,
    memoriesScanned: 0,
    merged: 0,
    decayed: 0,
  };
  for (const owner of owners) {
    const r = consolidateCompanionMemories(owner, options);
    stats.companionsScanned += 1;
    stats.memoriesScanned += r.memoriesScanned;
    stats.merged += r.merged;
    stats.decayed += r.decayed;
  }
  return stats;
}
