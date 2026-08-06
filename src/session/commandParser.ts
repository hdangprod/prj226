/**
 * PRJ226 v4.2: Deterministic lifecycle-command parser (§10.5, §8).
 *
 * Commands are parsed before debounce, intent routing, retrieval, or any LLM
 * call. They are recognized only as the first non-whitespace token and must
 * exactly match the command (optionally with the bot username suffix).
 */

import type { LifecycleCommand, ParsedCommand } from './sessionTypes';

const COMMANDS: ReadonlyArray<LifecycleCommand> = [
  'start',
  'end',
  'new',
  'status',
  'summary',
  'retry',
  'cancel',
  'forget_session',
];

export function isLifecycleCommandToken(token: string): token is LifecycleCommand {
  return (COMMANDS as readonly string[]).includes(token);
}

export function parseLifecycleCommand(
  text: string,
  botUsername?: string,
): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { kind: 'not_command' };
  }

  const [rawToken, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(' ').trim() || undefined;

  const normalized = rawToken.toLowerCase();
  const suffix = botUsername ? `@${botUsername.toLowerCase()}` : undefined;

  let commandName: string | undefined;
  if (normalized.startsWith('/') && !normalized.includes('@')) {
    commandName = normalized.slice(1);
  } else if (suffix && normalized.startsWith('/') && normalized.endsWith(suffix)) {
    commandName = normalized.slice(1, -suffix.length);
  }

  if (commandName === undefined || !isLifecycleCommandToken(commandName)) {
    return { kind: 'not_command' };
  }

  return { kind: 'command', command: commandName, arg };
}
