/**
 * PRJ226 v4.2: Conversation-scope derivation (§5.2, §5.3).
 *
 * Pure function mapping a validated ingress update to a ConversationScope.
 * The Durable Object name is derived from scopeId, so per-scope isolation is
 * deterministic and never LLM-influenced.
 */

import type { ConversationScope } from './sessionTypes';

export interface ScopeInput {
  userId?: number;
  chatId: number;
  chatType: string; // 'private' | 'group' | 'supergroup' | 'channel'
  messageThreadId?: number;
  isTopicMessage?: boolean;
  isForum?: boolean;
}

export interface ScopeOptions {
  /** Private-chat topics are behind a flag until tested (§5.3). */
  privateTopicsEnabled: boolean;
  /** Shared group mode is disabled by default (§5.2, §16.10). */
  sharedGroupEnabled: boolean;
}

export function deriveConversationScope(
  input: ScopeInput,
  options: ScopeOptions,
): ConversationScope | null {
  const threadId = resolveThreadId(input, options);

  if (input.chatType === 'private') {
    return {
      scopeId: `telegram:chat:${input.chatId}:thread:${threadId}`,
      chatId: input.chatId,
      threadId,
      mode: 'private',
    };
  }

  if (input.chatType === 'group' || input.chatType === 'supergroup') {
    if (options.sharedGroupEnabled) {
      return {
        scopeId: `telegram:chat:${input.chatId}:thread:${threadId}:shared`,
        chatId: input.chatId,
        threadId,
        mode: 'shared',
      };
    }
    // Default secure mode: per-user context inside the group.
    if (input.userId === undefined) {
      return null;
    }
    return {
      scopeId: `telegram:chat:${input.chatId}:thread:${threadId}:user:${input.userId}`,
      chatId: input.chatId,
      threadId,
      userId: input.userId,
      mode: 'user_scoped',
    };
  }

  // Channels and unsupported chat types have no session.
  return null;
}

function resolveThreadId(input: ScopeInput, options: ScopeOptions): number {
  if (input.chatType === 'private') {
    if (!options.privateTopicsEnabled) return 0;
    return input.messageThreadId ?? 0;
  }
  if (input.chatType === 'group' || input.chatType === 'supergroup') {
    const isTopic = input.isTopicMessage === true || input.isForum === true;
    return isTopic ? input.messageThreadId ?? 0 : 0;
  }
  return 0;
}

export function scopeToDurableObjectName(scope: ConversationScope): string {
  return scope.scopeId.replace(/[^a-zA-Z0-9_-]/g, '_');
}
