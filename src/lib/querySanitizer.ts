/**
 * Sanitizes natural language conversational queries into clean topic terms for Vector & FTS5 search.
 * Example: "Do I have any note relates to PRJ226?" -> "PRJ226"
 * Example: "what do you know about PRJ226" -> "PRJ226"
 */

const LEAD_IN_PHRASES = [
  /\bwhat do you know about\b/i,
  /\bwhat do i know about\b/i,
  /\bwhat do you know of\b/i,
  /\bwhat do i know of\b/i,
  /\bdo you know about\b/i,
  /\bdo i know about\b/i,
  /\bdo you have any\b/i,
  /\bdo i have any\b/i,
  /\bdo we have any\b/i,
  /\bwhat do you have\b/i,
  /\bwhat do i have\b/i,
  /\bwhat is your knowledge of\b/i,
  /\bwhat are the\b/i,
  /\bwhat is the\b/i,
  /\bwhat about\b/i,
  /\bare there any\b/i,
  /\bis there any\b/i,
  /\bhow does the\b/i,
  /\bhow do the\b/i,
  /\bhow do i\b/i,
  /\bhow does\b/i,
  /\bcan you (?:tell me|show me|find|search)\b/i,
  /\bplease (?:tell me|show me|search for|find|give me)\b/i,
  /\btell me about\b/i,
  /\bshow me\b/i,
  /\bsearch for\b/i,
  /\bsearch\b/i,
  /\bfind\b/i,
  /\blist\b/i,
  /\bgive me\b/i,
  /\bexplain\b/i,
];

const NOISE_WORDS = [
  /\bnotes?\b/gi,
  /\bdocuments?\b/gi,
  /\bfiles?\b/gi,
  /\binfo(?:rmation)?\b/gi,
  /\bknowledge\b/gi,
  /\b(?:about|related to|relating to|regarding|on|for|with)\b/gi,
  /\bthat (?:you|i) (?:know|have)\b/gi,
];

const STOPWORDS = new Set([
  'do', 'does', 'did', 'you', 'i', 'your', 'we', 'my', 'our', 'me', 'the', 'a', 'an',
  'what', 'how', 'why', 'when', 'where', 'who', 'which', 'about', 'with', 'and', 'or',
  'of', 'for', 'on', 'in', 'to', 'know', 'have', 'has', 'had', 'is', 'are', 'was',
  'were', 'any', 'some', 'that', 'this', 'it', 'its', 'please', 'related', 'relating',
  'regarding', 'tell', 'show', 'find', 'search', 'list', 'give', 'explain',
]);

export function extractSearchKeywords(text: string): { cleanTopic: string; ftsQuery: string } {
  let cleaned = text.trim();

  // Strip conversational lead-in phrases
  for (const pattern of LEAD_IN_PHRASES) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Strip noise words (note/doc/file/info/about/related...)
  for (const pattern of NOISE_WORDS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Strip punctuation and collapse whitespace
  cleaned = cleaned.replace(/[\?!\.\,\":]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    cleaned = text.replace(/[\?!\.\,\":]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Format FTS5 query: non-stopword tokens joined by OR
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w.toLowerCase()));
  const ftsQuery = words.length > 0 ? words.map((w) => `"${w.replace(/"/g, '')}"`).join(' OR ') : cleaned;

  return { cleanTopic: cleaned, ftsQuery };
}
