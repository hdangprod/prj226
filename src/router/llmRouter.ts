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

import { generateText, generateObject, embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
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
type Provider = 'google' | 'openai' | 'anthropic';

function createModel(provider: Provider, modelId: string, apiKey: string) {
  switch (provider) {
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    default:
      throw new Error(`[LLMRouter] Unsupported provider: ${provider}`);
  }
}

function createEmbedModel(provider: Provider, modelId: string, apiKey: string) {
  switch (provider) {
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google.textEmbeddingModel(modelId);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai.embedding(modelId);
    }
    default:
      throw new Error(`[LLMRouter] Embedding not supported for provider: ${provider}`);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class LLMRouter {
  private readonly fastModel: ReturnType<typeof createModel>;
  private readonly proModel: ReturnType<typeof createModel>;
  private readonly embedModel: ReturnType<typeof createEmbedModel>;

  constructor(env: Env) {
    const fastProvider = (env.LLM_FAST_PROVIDER || 'google') as Provider;
    const proProvider = (env.LLM_PRO_PROVIDER || 'google') as Provider;
    // Embed always uses fast provider's API key
    const embedProvider = fastProvider;

    this.fastModel = createModel(fastProvider, env.LLM_FAST_MODEL || 'gemini-2.0-flash-lite', env.LLM_FAST_API_KEY);
    this.proModel = createModel(proProvider, env.LLM_PRO_MODEL || 'gemini-2.5-flash', env.LLM_PRO_API_KEY);
    this.embedModel = createEmbedModel(embedProvider, env.LLM_EMBED_MODEL || 'text-embedding-004', env.LLM_FAST_API_KEY);
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
        maxTokens: 4096,
      });
      return result.text;
    });
  }

  /** Generate 768-dim embedding vector for semantic search */
  async embedText(text: string): Promise<number[]> {
    return withRetry(async () => {
      const result = await embed({
        model: this.embedModel,
        value: text,
      });
      return result.embedding;
    });
  }
}
