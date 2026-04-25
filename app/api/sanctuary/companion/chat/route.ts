import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  chatWithCompanion,
  getCompanionChatHistory,
  getActiveCompanion,
  getJournalEntries,
  getUnlockedTraits,
  generateTemplateCompanionReply,
  persistCompanionChatExchange,
} from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import {
  ethAddress,
  tokenId,
  paginationLimit,
  parseSearchParams,
  parseBody,
  formatZodError,
} from '@/lib/sanctuary/validation';
import { buildChatPrompt, estimatePromptTokens } from '@/lib/sanctuary/chatPersonality';
import {
  callOpenRouterChat,
  estimateCostUsd,
  getOpenRouterConfigFromEnv,
} from '@/lib/sanctuary/openrouter';
import {
  checkDailyChatLimit,
  recordChatUsage,
} from '@/lib/sanctuary/chatUsage';

const getSchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  limit: paginationLimit(100, 50),
});

const postSchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  message: z.string().min(1, 'Message cannot be empty').transform((s) => s.trim().slice(0, 500)),
});

function isDryRun(): boolean {
  const v = process.env.SANCTUARY_CHAT_DRY_RUN;
  return v === '1' || v === 'true' || v === 'TRUE';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(getSchema, searchParams);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, token_id: tid, limit } = parsed.data;
    const messages = getCompanionChatHistory(address, tid, limit);
    return NextResponse.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get chat' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(postSchema, body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, token_id: tid, message } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'companion/chat');
    if (rateLimited) return rateLimited;

    if (!message) {
      return NextResponse.json({ success: false, error: 'Message cannot be empty' }, { status: 400 });
    }

    const openRouterConfig = getOpenRouterConfigFromEnv();
    const dryRun = isDryRun();
    const llmPathEnabled = !!openRouterConfig;

    if (!llmPathEnabled) {
      const result = chatWithCompanion(address, tid, message);
      return NextResponse.json({
        success: true,
        ...result,
        meta: { mode: 'template', reason: 'OPENROUTER_API_KEY not set' },
      });
    }

    const dailyLimit = checkDailyChatLimit(address);
    if (!dailyLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Daily LLM chat limit reached (${dailyLimit.used}/${dailyLimit.limit}). Resets at 00:00 UTC.`,
          meta: { mode: 'limit', dailyLimit },
        },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    const companion = getActiveCompanion(address.toLowerCase());
    if (!companion || companion.token_id !== tid) {
      return NextResponse.json({ success: false, error: 'No active companion found' }, { status: 404 });
    }

    const history = getCompanionChatHistory(address, tid, 10);
    const journal = getJournalEntries(address, tid, 8);
    const unlockedTraits = getUnlockedTraits(address, tid);

    const prompt = buildChatPrompt({
      companion,
      history,
      journal,
      unlockedTraits,
      userMessage: message,
    });

    if (dryRun) {
      const estimatedPromptTokens = estimatePromptTokens(prompt);
      const fallbackReply = generateTemplateCompanionReply(companion, message, history);
      const persisted = persistCompanionChatExchange(address, tid, message, fallbackReply);
      const model = openRouterConfig.model;
      recordChatUsage({
        walletAddress: address,
        tokenId: tid,
        model,
        promptTokens: estimatedPromptTokens,
        completionTokens: 0,
        totalTokens: estimatedPromptTokens,
        estimatedCostUsd: estimateCostUsd(model, {
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: 0,
          total_tokens: estimatedPromptTokens,
        }),
        wasDryRun: true,
      });
      return NextResponse.json({
        success: true,
        ...persisted,
        meta: {
          mode: 'dry_run',
          model,
          estimatedPromptTokens,
          systemPromptPreview: prompt.system,
          dailyLimit: checkDailyChatLimit(address),
        },
      });
    }

    let llmResult;
    try {
      llmResult = await callOpenRouterChat(openRouterConfig, prompt, {
        maxTokens: Number(process.env.SANCTUARY_CHAT_MAX_TOKENS ?? 200),
        temperature: Number(process.env.SANCTUARY_CHAT_TEMPERATURE ?? 0.85),
      });
    } catch (err) {
      const fallbackReply = generateTemplateCompanionReply(companion, message, history);
      const persisted = persistCompanionChatExchange(address, tid, message, fallbackReply);
      return NextResponse.json({
        success: true,
        ...persisted,
        meta: {
          mode: 'template_fallback',
          error: err instanceof Error ? err.message : 'OpenRouter call failed',
        },
      });
    }

    const persisted = persistCompanionChatExchange(address, tid, message, llmResult.content);
    recordChatUsage({
      walletAddress: address,
      tokenId: tid,
      model: llmResult.model,
      promptTokens: llmResult.usage.prompt_tokens,
      completionTokens: llmResult.usage.completion_tokens,
      totalTokens: llmResult.usage.total_tokens,
      estimatedCostUsd: llmResult.estimatedCostUsd,
      wasDryRun: false,
    });

    return NextResponse.json({
      success: true,
      ...persisted,
      meta: {
        mode: 'llm',
        model: llmResult.model,
        usage: llmResult.usage,
        estimatedCostUsd: llmResult.estimatedCostUsd,
        dailyLimit: checkDailyChatLimit(address),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to chat';
    const status = msg.includes('No active companion') ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
