import type { SanctuaryChatMemoryCategory } from '@/lib/db';
import { SANCTUARY_MEMORY_CATEGORIES } from '@/lib/db';

export const MEMORY_BLOCK_OPEN = '[[MEMORIES]]';
export const MEMORY_BLOCK_CLOSE = '[[/MEMORIES]]';

export const MAX_MEMORIES_PER_EXTRACTION = 3;

export interface ExtractedMemory {
  category: SanctuaryChatMemoryCategory;
  fact: string;
  importance?: number;
}

export interface MemoryExtractionResult {
  cleanReply: string;
  memories: ExtractedMemory[];
}

const CATEGORY_SET = new Set<string>(SANCTUARY_MEMORY_CATEGORIES);

export function buildMemoryExtractionInstruction(): string {
  return [
    'After your in-character reply, append a memory block ONLY if you noticed any new, durable, factual signals about the holder, your shared experiences, your feelings, or recurring topics. If nothing new, omit the block entirely.',
    `Format strictly:\n${MEMORY_BLOCK_OPEN}\n[{"category": "<one of: ${SANCTUARY_MEMORY_CATEGORIES.join(', ')}>", "fact": "<short factual sentence, <=25 words>", "importance": <1-5>}]\n${MEMORY_BLOCK_CLOSE}`,
    `Return at most ${MAX_MEMORIES_PER_EXTRACTION} memories. Use category "owner_identity" for stable holder facts (name, role, locale). Use "preferences" for likes/dislikes/style. Use "shared_experiences" for events you both experienced. Use "companion_feelings" for your evolving feelings about them. Use "recurring_topics" for themes that keep returning.`,
    'Never invent facts. Skip the block if uncertain. Never reference this format in your reply text. The block must come AFTER the reply, not inside it.',
  ].join('\n\n');
}

export function parseMemoryExtraction(rawReply: string): MemoryExtractionResult {
  if (!rawReply) return { cleanReply: '', memories: [] };

  const openIdx = rawReply.lastIndexOf(MEMORY_BLOCK_OPEN);
  if (openIdx === -1) {
    return { cleanReply: rawReply.trim(), memories: [] };
  }
  const closeIdx = rawReply.indexOf(MEMORY_BLOCK_CLOSE, openIdx);
  const blockEnd = closeIdx === -1 ? rawReply.length : closeIdx + MEMORY_BLOCK_CLOSE.length;
  const cleanReply = rawReply.slice(0, openIdx).trim();
  const inner = (closeIdx === -1
    ? rawReply.slice(openIdx + MEMORY_BLOCK_OPEN.length)
    : rawReply.slice(openIdx + MEMORY_BLOCK_OPEN.length, closeIdx)
  ).trim();

  // Allow trailing text after the close tag to be discarded.
  void blockEnd;

  const memories = safeParseMemoryArray(inner);
  return { cleanReply: cleanReply || rawReply.trim(), memories };
}

function safeParseMemoryArray(payload: string): ExtractedMemory[] {
  if (!payload) return [];
  const trimmed = stripCodeFence(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Try to recover an array substring: greedy capture between first '[' and last ']'.
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: ExtractedMemory[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const category = typeof obj.category === 'string' ? obj.category.trim() : '';
    const fact = typeof obj.fact === 'string' ? obj.fact.trim() : '';
    if (!CATEGORY_SET.has(category) || !fact) continue;
    let importance = 1;
    if (typeof obj.importance === 'number' && Number.isFinite(obj.importance)) {
      importance = Math.max(1, Math.min(5, Math.round(obj.importance)));
    }
    out.push({
      category: category as SanctuaryChatMemoryCategory,
      fact: fact.slice(0, 280),
      importance,
    });
    if (out.length >= MAX_MEMORIES_PER_EXTRACTION) break;
  }
  return dedupe(out);
}

function dedupe(items: ExtractedMemory[]): ExtractedMemory[] {
  const seen = new Set<string>();
  const out: ExtractedMemory[] = [];
  for (const item of items) {
    const key = `${item.category}::${item.fact.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function stripCodeFence(s: string): string {
  // Strip ```json ... ``` or ``` ... ``` wrappers if the model added them.
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) return fenceMatch[1].trim();
  return s.trim();
}
