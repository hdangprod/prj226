/**
 * Sanitizes natural language conversational queries into clean topic terms for Vector & FTS5 search.
 * Example: "Do I have any note relates to PRJ226?" -> "PRJ226"
 */
export function extractSearchKeywords(text: string): { cleanTopic: string; ftsQuery: string } {
  let cleaned = text
    .replace(/^(do i have|are there|find|search|show me|get|list|do we have|is there|what) (any |the )?(notes?|info|information|tasks?|documents?)? (relates? to|related to|about|on|for|regarding)?/gi, '')
    .replace(/^(do i have|are there|find|search|show me|get|list|do we have|is there|what)\s*/gi, '')
    .replace(/\b(note|notes|document|documents|file|files|relates?|related)\b/gi, '')
    .replace(/[\?!\.\,\"]/g, '')
    .trim();

  if (!cleaned) {
    cleaned = text.replace(/[\?!\.\,\"]/g, '').trim();
  }

  // Format FTS5 query: extract non-stopword tokens
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);
  const ftsQuery = words.length > 0 ? words.map((w) => `"${w.replace(/"/g, '')}"`).join(' OR ') : cleaned;

  return { cleanTopic: cleaned, ftsQuery };
}
