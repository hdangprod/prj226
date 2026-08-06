/**
 * PRJ226 v4.2: Secret detection and redaction (§16.5).
 *
 * Before user content goes to an external model, high-risk patterns are
 * replaced with deterministic placeholders. The original secret is never
 * logged; callers log only counts and kinds.
 */

export interface RedactionResult {
  text: string;
  redactedCount: number;
  kinds: string[];
}

interface SecretPattern {
  kind: string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { kind: 'github_token', pattern: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { kind: 'openai_key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'anthropic_key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'google_key', pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { kind: 'aws_access_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'bearer_token', pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g },
  {
    kind: 'private_key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  { kind: 'telegram_bot_token', pattern: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g },
  {
    kind: 'credential_assignment',
    pattern: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{8,}['"]?/gi,
  },
];

export function redactSecrets(input: string): RedactionResult {
  let text = input;
  const kinds: string[] = [];
  let redactedCount = 0;

  for (const { kind, pattern } of SECRET_PATTERNS) {
    const matches = text.match(pattern);
    if (!matches || matches.length === 0) continue;
    text = text.replace(pattern, `[REDACTED:${kind}]`);
    redactedCount += matches.length;
    if (!kinds.includes(kind)) kinds.push(kind);
  }

  return { text, redactedCount, kinds };
}

export function hasLikelySecrets(input: string): boolean {
  return SECRET_PATTERNS.some(({ pattern }) => pattern.test(input));
}
