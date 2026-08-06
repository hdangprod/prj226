/**
 * PRJ226 v4.2: Conservative token estimation & budget decisions (§13.2, §13.3).
 *
 * Estimate before a model call; store actual provider-reported usage after.
 * Character count is never the final accounting source.
 */

/** Conservative chars-per-token assumption. Lower is more conservative. */
export const DEFAULT_CHARS_PER_TOKEN = 3;

export function estimateTokens(text: string, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
  if (!text) return 0;
  return Math.ceil(text.length / charsPerToken);
}

export interface PromptBudgetInput {
  metadataTokens: number;
  summaryTokens: number;
  recentTurnsTokens: number;
  ragTokens: number;
  currentTurnTokens: number;
}

export function totalPromptInputTokens(input: PromptBudgetInput): number {
  return (
    input.metadataTokens +
    input.summaryTokens +
    input.recentTurnsTokens +
    input.ragTokens +
    input.currentTurnTokens
  );
}

export function fitsWithinPromptBudget(input: PromptBudgetInput, promptMaxInputTokens: number): boolean {
  return totalPromptInputTokens(input) <= promptMaxInputTokens;
}

/** Compact when the estimated prompt exceeds 80% of the input budget (§13.4). */
export function needsCompaction(input: PromptBudgetInput, promptMaxInputTokens: number): boolean {
  return totalPromptInputTokens(input) > promptMaxInputTokens * 0.8;
}

/** Compact when unsummarized historical turns exceed 10k tokens (§13.4). */
export const UNSUMMARIZED_HISTORY_MAX_TOKENS = 10_000;

export function exceedsUnsummarizedHistoryBudget(unsummarizedHistoricalTokens: number): boolean {
  return unsummarizedHistoricalTokens > UNSUMMARIZED_HISTORY_MAX_TOKENS;
}

export function exceedsUserTurnLimit(currentTurnTokens: number, maxUserTurnTokens: number): boolean {
  return currentTurnTokens > maxUserTurnTokens;
}

export function exceedsSessionInputLimit(inputTokensTotal: number, maxInputTokensTotal: number): boolean {
  return inputTokensTotal > maxInputTokensTotal;
}

export function exceedsSessionOutputLimit(outputTokensTotal: number, maxOutputTokensTotal: number): boolean {
  return outputTokensTotal > maxOutputTokensTotal;
}

export function exceedsSessionLlmCalls(llmCalls: number, maxLlmCalls: number): boolean {
  return llmCalls >= maxLlmCalls;
}
