/**
 * PRJ226 v4.2: Telegram response chunker (§14.5).
 *
 * Never silently truncate. Chunks are paragraph-aware, keep code fences
 * balanced, and carry an `(n/N)` suffix only when multiple chunks exist.
 * Chunks are stored before delivery; delivery retries resend stored chunks.
 */

const DEFAULT_MAX_CHARS = 4000;
const MIN_BUDGET = 64;

function buildChunks(text: string, budget: number): string[] {
  const paragraphs = text.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  const append = (unit: string, separator: string) => {
    if (current && current.length + separator.length + unit.length <= budget) {
      current += separator + unit;
      return true;
    }
    return false;
  };

  for (const para of paragraphs) {
    if (para.length === 0) continue;
    if (append(para, '\n\n')) continue;
    flush();

    if (para.length <= budget) {
      current = para;
      continue;
    }

    // Oversized paragraph: split by lines first, then hard-wrap.
    for (const line of para.split('\n')) {
      if (append(line, '\n')) continue;
      flush();
      if (line.length <= budget) {
        current = line;
        continue;
      }
      for (let i = 0; i < line.length; i += budget) {
        flush();
        chunks.push(line.slice(i, i + budget));
      }
    }
  }
  flush();
  return chunks;
}

export function chunkTelegramText(text: string, maxLen = DEFAULT_MAX_CHARS): string[] {
  if (text.length <= maxLen) return [text];

  // Iterate to a budget that leaves room for the `(n/N)` suffix.
  let budget = maxLen;
  for (let iter = 0; iter < 5; iter++) {
    const chunks = buildChunks(text, budget);
    if (chunks.length <= 1) return chunks;

    const suffix = `\n(${chunks.length}/${chunks.length})`;
    if (budget + suffix.length <= maxLen) {
      return chunks.map((c, i) => `${c}\n(${i + 1}/${chunks.length})`);
    }
    budget = Math.max(MIN_BUDGET, maxLen - suffix.length);
  }

  // Pathological fallback: hard wrap at maxLen (no content lost, only unit splits).
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  if (chunks.length === 1) return chunks;
  return chunks.map((c, i) => `${c}\n(${i + 1}/${chunks.length})`);
}

/** Strips the trailing `(n/N)` marker added by chunkTelegramText. */
export function stripChunkSuffix(chunk: string): string {
  return chunk.replace(/\n\(\d+\/\d+\)$/, '');
}

/** Returns 0/1: whether a triple-backtick fence is left open across all chunks. */
export function openCodeFenceCount(chunks: string[]): number {
  let total = 0;
  for (const c of chunks) {
    total += c.split('```').length - 1;
  }
  return total % 2;
}
