import type { ChatPromptOutput } from './chatPersonality';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  referer?: string;
  appTitle?: string;
  endpoint?: string;
}

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenRouterChatResult {
  content: string;
  model: string;
  usage: OpenRouterUsage;
  estimatedCostUsd: number;
}

const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const COST_PER_1K_TOKENS_USD: Record<string, { input: number; output: number }> = {
  'google/gemini-2.0-flash-001': { input: 0.0001, output: 0.0004 },
  'google/gemini-flash-1.5': { input: 0.000075, output: 0.0003 },
};

export function estimateCostUsd(model: string, usage: OpenRouterUsage): number {
  const rates = COST_PER_1K_TOKENS_USD[model];
  if (!rates) return 0;
  return (usage.prompt_tokens * rates.input + usage.completion_tokens * rates.output) / 1000;
}

export function getOpenRouterConfigFromEnv(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.SANCTUARY_CHAT_MODEL || 'google/gemini-2.0-flash-001',
    referer: process.env.OPENROUTER_REFERER || 'https://starworldorder.com',
    appTitle: process.env.OPENROUTER_APP_TITLE || 'Star World Order Sanctuary',
    endpoint: process.env.OPENROUTER_ENDPOINT || DEFAULT_ENDPOINT,
  };
}

export async function callOpenRouterChat(
  config: OpenRouterConfig,
  prompt: ChatPromptOutput,
  options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<OpenRouterChatResult> {
  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  const body = {
    model: config.model,
    max_tokens: options.maxTokens ?? 200,
    temperature: options.temperature ?? 0.85,
    messages: [
      { role: 'system', content: prompt.system },
      ...prompt.messages,
    ],
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.referer ? { 'HTTP-Referer': config.referer } : {}),
      ...(config.appTitle ? { 'X-Title': config.appTitle } : {}),
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${response.status}): ${errText.slice(0, 300)}`);
  }

  const json = await response.json() as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    model?: string;
  };

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenRouter returned empty completion');
  }

  const usage: OpenRouterUsage = {
    prompt_tokens: json.usage?.prompt_tokens ?? 0,
    completion_tokens: json.usage?.completion_tokens ?? 0,
    total_tokens: json.usage?.total_tokens ?? 0,
  };

  const model = json.model || config.model;

  return {
    content,
    model,
    usage,
    estimatedCostUsd: estimateCostUsd(model, usage),
  };
}
