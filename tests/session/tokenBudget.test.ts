import { Harness } from './harness';
import {
  estimateTokens,
  totalPromptInputTokens,
  fitsWithinPromptBudget,
  needsCompaction,
  exceedsUserTurnLimit,
  exceedsSessionInputLimit,
  exceedsSessionOutputLimit,
  exceedsSessionLlmCalls,
} from '../../src/session/tokenBudget';
export async function run(h: Harness): Promise<void> {
  h.assert(estimateTokens('') === 0, 'empty text is 0 tokens');
  h.assert(estimateTokens('abcd1234') === 3, 'conservative estimate uses ~3 chars/token');
  h.assert(estimateTokens('a'.repeat(300)) === 100, 'estimation scales with chars');

  // Total prompt math
  const input = {
    metadataTokens: 500,
    summaryTokens: 1000,
    recentTurnsTokens: 3000,
    ragTokens: 2000,
    currentTurnTokens: 500,
  };
  h.assert(totalPromptInputTokens(input) === 7000, 'total prompt token sum');

  h.assert(fitsWithinPromptBudget(input, 24_000) === true, 'fits within budget');
  h.assert(fitsWithinPromptBudget(input, 5000) === false, 'does not fit small budget');

  // Compaction at 80%
  const nearLimit = { ...input, currentTurnTokens: 14_000 };
  h.assert(needsCompaction(nearLimit, 24_000) === true, 'compaction triggered above 80%');
  h.assert(needsCompaction(input, 24_000) === false, 'no compaction below 80%');

  h.assert(exceedsUserTurnLimit(7000, 6000) === true, 'oversize user turn detected');
  h.assert(exceedsUserTurnLimit(5000, 6000) === false, 'normal user turn allowed');

  h.assert(exceedsSessionInputLimit(200_000, 150_000) === true, 'session input budget exceeded');
  h.assert(exceedsSessionOutputLimit(40_000, 30_000) === true, 'session output budget exceeded');
  h.assert(exceedsSessionLlmCalls(100, 100) === true, 'session LLM-call cap reached at max');
  h.assert(exceedsSessionLlmCalls(99, 100) === false, 'session LLM call below cap');
}

export default run;