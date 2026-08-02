/**
 * PRJ226 v3.0: Model-Agnostic LLM Router
 *
 * STRICT REQUIREMENT: No business logic may import Gemini/OpenAI/Anthropic SDKs directly.
 * All AI calls MUST go through this router. Provider and model are 100% env-driven.
 *
 * Supported providers (via Vercel AI SDK):
 *   - 'google'    → @ai-sdk/google  (default: gemini-2.0-flash / gemini-2.5-pro)
 *   - 'openai'    → @ai-sdk/openai  (e.g. gpt-4o-mini / gpt-4o)
 *   - 'anthropic' → @ai-sdk/anthropic (e.g. claude-haiku / claude-sonnet)
 */

import { generateText, generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { ZodSchema } from 'zod';
import type { Env } from '../config';

// ─── Retry Config ────────────────────────────────────────────────────────────
const RETRY_DELAYS_MS = [350, 700, 1400];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const isRateLimit =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status: number }).status === 429;
      if (isRateLimit && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        console.warn(`[LLMRouter] Rate limit hit. Retrying in ${delay}ms (attempt ${attempt + 1})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// ─── Provider Factory ────────────────────────────────────────────────────────
type Provider = 'google' | 'openai' | 'anthropic' | 'openrouter';

function createModel(provider: Provider, modelId: string, apiKey: string) {
  const cleanKey = (apiKey || '').trim();
  switch (provider) {
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: cleanKey });
      return google(modelId);
    }
    case 'openrouter': {
      const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: cleanKey,
        headers: {
          'HTTP-Referer': 'https://github.com/hdangprod/prj226',
          'X-Title': 'PRJ226 Liam AIOS',
        },
      });
      return openrouter(modelId);
    }
    case 'openai':
    case 'anthropic':
      throw new Error(`[LLMRouter] Provider ${provider} is not installed`);
    default:
      throw new Error(`[LLMRouter] Unsupported provider: ${provider}`);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class LLMRouter {
  private readonly fastModel: ReturnType<typeof createModel>;
  private readonly proModel: ReturnType<typeof createModel>;

  constructor(env: Env) {
    const rawKey = (env.OPENROUTER_API_KEY || env.LLM_FAST_API_KEY || env.LLM_PRO_API_KEY || env.GEMINI_API_KEY || '').trim();
    const defaultProvider = env.OPENROUTER_API_KEY ? 'openrouter' : 'google';
    const fastProvider = (env.LLM_FAST_PROVIDER || defaultProvider) as Provider;
    const proProvider = (env.LLM_PRO_PROVIDER || defaultProvider) as Provider;

    const fastKey = (env.LLM_FAST_API_KEY || rawKey).trim();
    const proKey = (env.LLM_PRO_API_KEY || rawKey).trim();

    this.fastModel = createModel(fastProvider, env.LLM_FAST_MODEL || 'google/gemini-3.5-flash-lite', fastKey);
    this.proModel = createModel(proProvider, env.LLM_PRO_MODEL || 'google/gemini-3.6-flash', proKey);
  }

  /** Fast model: intent routing, task extraction, text parsing */
  async callFast(prompt: string, system?: string): Promise<string> {
    return withRetry(async () => {
      const result = await generateText({
        model: this.fastModel,
        prompt,
        system,
        maxTokens: 1024,
      });
      return result.text;
    });
  }

  /** Fast model with structured output (Zod schema) */
  async callFastStructured<T>(prompt: string, schema: ZodSchema<T>, system?: string): Promise<T> {
    return withRetry(async () => {
      const result = await generateObject({
        model: this.fastModel,
        prompt,
        system,
        schema,
      });
      return result.object;
    });
  }

  /** Pro model: complex reasoning, synthesis, weekly planning */
  async callPro(prompt: string, system?: string): Promise<string> {
    return withRetry(async () => {
      const result = await generateText({
        model: this.proModel,
        prompt,
        system,
        maxTokens: 2048,
      });
      return result.text;
    });
  }
}
