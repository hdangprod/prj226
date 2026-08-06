/**
 * PRJ226 v4.2: Ingress authorization policy (§5.1).
 *
 * An update is admitted only when the webhook secret is valid, from.id is
 * allowlisted, chat.id is allowlisted, from.is_bot is false, and the shape is
 * supported. Unauthorized updates get HTTP 200 with no response and no
 * sensitive diagnostics.
 */

export interface AuthorizationInput {
  userId?: number;
  chatId?: number;
  isBot?: boolean;
  allowedUserIds: number[];
  allowedChatIds: number[];
}

export type Authorization =
  | { allowed: true }
  | { allowed: false; reason: 'missing_identity' | 'bot' | 'user_not_allowed' | 'chat_not_allowed' };

export function authorizeUpdate(input: AuthorizationInput): Authorization {
  if (input.userId === undefined || input.chatId === undefined) {
    return { allowed: false, reason: 'missing_identity' };
  }
  if (input.isBot === true) {
    return { allowed: false, reason: 'bot' };
  }
  if (!input.allowedUserIds.includes(input.userId)) {
    return { allowed: false, reason: 'user_not_allowed' };
  }
  if (!input.allowedChatIds.includes(input.chatId)) {
    return { allowed: false, reason: 'chat_not_allowed' };
  }
  return { allowed: true };
}
