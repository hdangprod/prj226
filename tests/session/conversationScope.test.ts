import { Harness } from './harness';
import {
  deriveConversationScope,
  scopeToDurableObjectName,
  type ScopeInput,
} from '../../src/session/conversationScope';

export async function run(h: Harness): Promise<void> {
  const opts = { privateTopicsEnabled: false, sharedGroupEnabled: false };

  // Private chat
  const privateScope = deriveConversationScope(
    { userId: 1, chatId: 123, chatType: 'private' },
    opts,
  );
  h.assert(privateScope !== null, 'private chat yields a scope');
  h.assert(
    privateScope?.scopeId === 'telegram:chat:123:thread:0',
    'private chat scopeId is telegram:chat:123:thread:0',
  );
  h.assert(privateScope?.mode === 'private', 'private chat mode is private');

  // Private chat topic disabled by default
  const privateTopicDisabled = deriveConversationScope(
    { userId: 1, chatId: 123, chatType: 'private', messageThreadId: 5, isTopicMessage: true },
    opts,
  );
  h.assert(
    privateTopicDisabled?.scopeId === 'telegram:chat:123:thread:0',
    'private chat topic ignored when flag disabled',
  );

  const privateTopicEnabled = deriveConversationScope(
    { userId: 1, chatId: 123, chatType: 'private', messageThreadId: 5 },
    { privateTopicsEnabled: true, sharedGroupEnabled: false },
  );
  h.assert(
    privateTopicEnabled?.scopeId === 'telegram:chat:123:thread:5',
    'private chat topic used when flag enabled',
  );

  // Group, secure per-user default
  const groupScoped = deriveConversationScope(
    { userId: 42, chatId: 900, chatType: 'supergroup' },
    opts,
  );
  h.assert(
    groupScoped?.scopeId === 'telegram:chat:900:thread:0:user:42',
    'group secure mode scopes by user',
  );
  h.assert(groupScoped?.mode === 'user_scoped', 'group secure mode is user_scoped');

  // Group without user identity
  const noUser = deriveConversationScope({ chatId: 900, chatType: 'supergroup' }, opts);
  h.assert(noUser === null, 'group without userId yields null');

  // Forum topic in a group
  const forum = deriveConversationScope(
    { userId: 42, chatId: 900, chatType: 'supergroup', messageThreadId: 7, isForum: true },
    opts,
  );
  h.assert(
    forum?.scopeId === 'telegram:chat:900:thread:7:user:42',
    'forum topic thread is included in scope',
  );

  // Shared group mode (opt-in)
  const shared = deriveConversationScope(
    { userId: 42, chatId: 900, chatType: 'group' },
    { privateTopicsEnabled: false, sharedGroupEnabled: true },
  );
  h.assert(
    shared?.scopeId === 'telegram:chat:900:thread:0:shared',
    'shared group mode scopeId ends in :shared',
  );
  h.assert(shared?.mode === 'shared', 'shared group mode is shared');

  // Channel / unsupported
  h.assert(
    deriveConversationScope({ userId: 1, chatId: 1, chatType: 'channel' }, opts) === null,
    'channel chat yields null',
  );

  // Deterministic DO name
  const name = scopeToDurableObjectName(privateScope as NonNullable<typeof privateScope>);
  h.assert(/^[a-zA-Z0-9_-]+$/.test(name), 'scope-derived DO name is alphanumeric-safe');
  h.assert(
    name === scopeToDurableObjectName(privateScope as NonNullable<typeof privateScope>),
    'scope-to-DO-name is deterministic',
  );
}

export default run;
