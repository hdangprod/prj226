import { Harness } from './harness';
import { authorizeUpdate } from '../../src/session/securityPolicy';
import { redactSecrets, hasLikelySecrets } from '../../src/session/secretRedactor';
import { parseTelegramUpdate } from '../../src/session/sessionSchema';

export async function run(h: Harness): Promise<void> {
  const users = [111, 222];
  const chats = [999];

  // ── Authorization ──
  const ok = authorizeUpdate({ userId: 111, chatId: 999, isBot: false, allowedUserIds: users, allowedChatIds: chats });
  h.assert(ok.allowed === true, 'allowlisted user+chat is authorized');

  const missing = authorizeUpdate({ userId: 111, allowedUserIds: users, allowedChatIds: chats });
  h.assert(missing.allowed === false && missing.reason === 'missing_identity', 'missing chat is unauthorized');

  const bot = authorizeUpdate({ userId: 111, chatId: 999, isBot: true, allowedUserIds: users, allowedChatIds: chats });
  h.assert(bot.allowed === false && bot.reason === 'bot', 'bot messages are unauthorized');

  const wrongUser = authorizeUpdate({ userId: 333, chatId: 999, isBot: false, allowedUserIds: users, allowedChatIds: chats });
  h.assert(wrongUser.allowed === false && wrongUser.reason === 'user_not_allowed', 'non-allowlisted user unauthorized');

  const wrongChat = authorizeUpdate({ userId: 111, chatId: 555, isBot: false, allowedUserIds: users, allowedChatIds: chats });
  h.assert(wrongChat.allowed === false && wrongChat.reason === 'chat_not_allowed', 'non-allowlisted chat unauthorized');

  // ── Secret redaction ──
  const gh = redactSecrets('my token is ghp_123456789012345678901234567890123456');
  h.assert(gh.redactedCount >= 1 && gh.kinds.includes('github_token'), 'github token redacted');
  h.assert(!gh.text.includes('ghp_12345'), 'github token value removed from output');

  const pem = redactSecrets('-----BEGIN PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END PRIVATE KEY-----');
  h.assert(pem.redactedCount >= 1 && pem.kinds.includes('private_key'), 'private key block redacted');

  const tg = redactSecrets('bot 1234567890:AAbbCCddEEffGGhhIIjjKKllMMnnOOppQQrr');
  h.assert(tg.kinds.includes('telegram_bot_token'), 'telegram bot token redacted');

  const jwt = redactSecrets('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
  h.assert(jwt.kinds.includes('jwt'), 'jwt redacted');

  const clean = redactSecrets('just a normal question about the architecture');
  h.assert(clean.redactedCount === 0 && clean.text === 'just a normal question about the architecture', 'clean text unchanged');

  h.assert(hasLikelySecrets('use sk-abcdefghijklmnopqrstuvwxyz01234567 now') === true, 'hasLikelySecrets detects keys');
  h.assert(hasLikelySecrets('no secrets here') === false, 'hasLikelySecrets negative');

  // Redaction must not log the original secret (contract: function only returns counts).
  h.assert(!gh.text.toLowerCase().includes('ghp_'), 'redacted text carries no original value');

  // ── Update schema validation ──
  const valid = parseTelegramUpdate({
    update_id: 501,
    message: { message_id: 10, date: 1700000000, from: { id: 111, is_bot: false }, chat: { id: 999, type: 'private' }, text: 'hello' },
  });
  h.assert(valid.ok === true && valid.value.update_id === 501, 'valid message update parses');

  const cb = parseTelegramUpdate({
    update_id: 502,
    callback_query: { id: 'cb-1', from: { id: 111 }, data: 'x' },
  });
  h.assert(cb.ok === true && !!cb.value.callback_query, 'valid callback update parses');

  const badJson = parseTelegramUpdate(null);
  h.assert(badJson.ok === false, 'null payload rejected');

  const noType = parseTelegramUpdate({ update_id: 503 });
  h.assert(noType.ok === false && noType.reason === 'unsupported_type', 'update without message/callback rejected');

  const malformed = parseTelegramUpdate({ update_id: 'x', message: { chat: { id: 1 } } });
  h.assert(malformed.ok === false && malformed.reason === 'invalid_shape', 'malformed shape rejected');

  const botMsg = parseTelegramUpdate({
    update_id: 504,
    message: { message_id: 1, date: 1, from: { id: 111, is_bot: true }, chat: { id: 999, type: 'private' }, text: 'hi' },
  });
  h.assert(botMsg.ok === true, 'bot message shape is syntactically valid (policy layer rejects it)');
}

export default run;
