import { Harness } from './harness';
import { parseLifecycleCommand } from '../../src/session/commandParser';

export async function run(h: Harness): Promise<void> {
  const BOT = 'liam_second_brain_bot';

  const end = parseLifecycleCommand('/end', BOT);
  h.assert(end.kind === 'command' && end.command === 'end', '/end parses to end command');

  const start = parseLifecycleCommand('  /start  ', BOT);
  h.assert(start.kind === 'command' && start.command === 'start', 'whitespace-padded /start parses');

  const newTopic = parseLifecycleCommand('/new Docker deployment', BOT);
  h.assert(newTopic.kind === 'command' && newTopic.command === 'new', '/new parses');
  h.assert(newTopic.kind === 'command' && newTopic.arg === 'Docker deployment', '/new keeps topic arg');

  const suffixed = parseLifecycleCommand('/end@liam_second_brain_bot', BOT);
  h.assert(suffixed.kind === 'command' && suffixed.command === 'end', 'command with bot username suffix parses');

  const wrongBot = parseLifecycleCommand('/end@SomeOtherBot', BOT);
  h.assert(wrongBot.kind === 'not_command', 'command with wrong bot suffix is not a command');

  const suffixedArg = parseLifecycleCommand('/new@liam_second_brain_bot foo bar', BOT);
  h.assert(suffixedArg.kind === 'command' && suffixedArg.arg === 'foo bar', 'suffixed command keeps arg');

  h.assert(parseLifecycleCommand('/endfoo', BOT).kind === 'not_command', '/endfoo is not a command');
  h.assert(parseLifecycleCommand('hello /end', BOT).kind === 'not_command', 'non-first-token command is ignored');
  h.assert(parseLifecycleCommand('just chatting', BOT).kind === 'not_command', 'plain text is not a command');
  h.assert(parseLifecycleCommand('', BOT).kind === 'not_command', 'empty text is not a command');

  h.assert(parseLifecycleCommand('/cancel', BOT).kind === 'command', '/cancel parses');
  h.assert(parseLifecycleCommand('/retry', BOT).kind === 'command', '/retry parses');
  h.assert(parseLifecycleCommand('/status', BOT).kind === 'command', '/status parses');
  h.assert(parseLifecycleCommand('/summary', BOT).kind === 'command', '/summary parses');
  h.assert(parseLifecycleCommand('/start', BOT).kind === 'command', '/start parses');
  h.assert(parseLifecycleCommand('/forget_session', BOT).kind === 'command', '/forget_session parses');

  const upper = parseLifecycleCommand('/END', BOT);
  h.assert(upper.kind === 'command' && upper.command === 'end', 'uppercase command parses case-insensitively');

  const withArg = parseLifecycleCommand('/summary extra tokens', BOT);
  h.assert(withArg.kind === 'command' && withArg.arg === 'extra tokens', '/summary keeps arg');

  // Commands are deterministic: no LLM, no model output involved.
  const a = parseLifecycleCommand('/end', BOT);
  const b = parseLifecycleCommand('/end', BOT);
  h.assert(JSON.stringify(a) === JSON.stringify(b), 'command parsing is deterministic');
}

export default run;
