import { Harness } from './harness';
import {
  chunkTelegramText,
  stripChunkSuffix,
  openCodeFenceCount,
} from '../../src/session/textChunker';

export async function run(h: Harness): Promise<void> {
  const short = 'Hello world';
  h.assert(JSON.stringify(chunkTelegramText(short)) === JSON.stringify([short]), 'short text returns single chunk');

  const max = 4000;
  const long = Array.from({ length: 3000 }, (_, i) => `para ${i} with some text content`).join('\n\n');
  const chunks = chunkTelegramText(long, max);
  h.assert(chunks.length > 1, 'long text produces multiple chunks');

  // Suffix only when multiple chunks exist
  const suffixes = chunks.map(stripChunkSuffix);
  h.assert(
    chunks.every((c) => /\n\(\d+\/\d+\)$/.test(c)),
    'every chunk carries an (n/N) suffix when multiple chunks exist',
  );
  h.assert(
    chunks.length >= 2 && chunks[0].endsWith('(1/' + chunks.length + ')'),
    'first chunk suffix is (1/N)',
  );

  // No chunk exceeds the max
  h.assert(
    chunks.every((c) => c.length <= max),
    'no chunk exceeds max length',
  );

  // No content loss: every original paragraph appears verbatim in some chunk
  const paragraphs = long.split('\n\n');
  const all = suffixes.join('\n');
  h.assert(
    paragraphs.every((p) => all.includes(p)),
    'every original paragraph is preserved across chunks',
  );

  // Paragraph-aware: a single short paragraph is never split.
  const mixed = 'A'.repeat(100) + '\n\n' + 'B'.repeat(100) + '\n\n' + 'C'.repeat(100);
  const mixedChunks = chunkTelegramText(mixed, 250);
  h.assert(mixedChunks.length >= 2, 'paragraph-aware chunking splits at paragraph boundaries');
  h.assert(
    'A'.repeat(100) === stripChunkSuffix(mixedChunks[0]) || stripChunkSuffix(mixedChunks[0]).includes('A'.repeat(100)),
    'paragraph content is preserved intact',
  );

  // Code fences stay balanced across chunk boundaries.
  const fenced =
    'start\n\n```ts\n' + 'line '.repeat(1000) + '\n```\n\nend';
  const fencedChunks = chunkTelegramText(fenced, max);
  h.assert(openCodeFenceCount(fencedChunks) === 0, 'code fences balanced across chunks');
  h.assert(
    fencedChunks.map(stripChunkSuffix).join('\n').includes('```ts'),
    'fenced content preserved across chunks',
  );

  // Oversized single paragraph is hard-split but never truncated.
  const bigPara = 'X'.repeat(10_000);
  const bigChunks = chunkTelegramText(bigPara, max);
  h.assert(bigChunks.length >= 3, 'oversized paragraph produces multiple chunks');
  h.assert(bigChunks.every((c) => c.length <= max), 'oversized paragraph chunks stay within limit');
  const bigAll = bigChunks.map(stripChunkSuffix).join('');
  h.assert(bigAll.length >= 10_000 && bigAll.includes('X'.repeat(10_000)), 'oversized paragraph fully preserved');

  // Reconstruct total length (minus suffixes) equals original.
  // Paragraph boundaries that fell between chunks were split at '\n\n'.
  const totalContent = chunks.map(stripChunkSuffix).join('\n\n');
  h.assert(totalContent.length === long.length, 'chunked content length equals original length');
}

export default run;
