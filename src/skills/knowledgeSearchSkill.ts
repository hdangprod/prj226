/**
 * PRJ226 v4.1: Knowledge Search Skill
 * Intent: Knowledge_Search
 *
 * Executes Hybrid RAG search using Reciprocal Rank Fusion (RRF) via D1 and Vectorize.
 * Returns a cited summary with inline Telegram action buttons for source access and Obsidian deep links.
 */

import type { SkillContext } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage, sendMessageWithKeyboard } from '../tools/telegramClient';
import { embedText } from '../lib/embeddings';
import { hybridSearch } from '../lib/hybridSearch';

export async function handleKnowledgeSearch(ctx: SkillContext): Promise<void> {
  const { chatId, userText, env } = ctx;
  const d1 = new D1Client(env);
  const llm = new LLMRouter(env);

  await sendMessage(chatId, '🔍 <i>Searching your knowledge base...</i>', env);

  // Generate query embedding
  const embedding = await embedText(userText, env);

  // RRF hybrid search
  await sendMessage(chatId, '🧠 <i>Calculating relevance scores...</i>', env);
  const results = await hybridSearch(userText, embedding, env);

  if (results.length === 0) {
    await sendMessage(
      chatId,
      `📒 <b>No results found</b>\n\nI couldn't find anything about "${escapeHtml(userText)}" in your notes or wiki yet.`,
      env,
    );
    return;
  }

  const resultIds = results.map(r => r.id);
  const chunks = await d1.getChunksByIds(resultIds);

  // Re-order chunks based on search result order
  const orderedChunks = results.map(r => chunks.find(c => c.id === r.id)).filter(c => c != null) as any[];

  // Synthesize a cited summary
  const sourceContext = orderedChunks
    .map(
      (c, i) =>
        `[Source ${i + 1}] ${c.title || c.file_path}:\n${c.content.substring(0, 300)}...`,
    )
    .join('\n\n');

  const summary = await llm.callPro(
    `The user asked: "${userText}"\n\nRelevant sources found:\n${sourceContext}\n\nWrite a concise, cited answer (2-3 sentences) referencing the source numbers. Use HTML formatting.`,
    'You are Liam, a precise AI second brain. Answer grounded in the provided sources only. Do not hallucinate.',
  );

  // Build inline keyboard for source links
  const keyboardRows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const c of orderedChunks.slice(0, 4)) {
    const titleText = c.title ? c.title.substring(0, 20) : c.file_path.substring(0, 20);
    const vault = 'hdangprod_wiki';
    const cleanPath = (c.file_path || '').replace(/\.md$/, '');
    const url = `obsidian://open?vault=${vault}&file=${encodeURIComponent(cleanPath)}`;

    keyboardRows.push([
      {
        text: `📝 ${titleText}`,
        callback_data: `view_chunk:${c.id}`,
      },
      {
        text: `🔗 Obsidian`,
        url,
      }
    ]);
  }

  await sendMessageWithKeyboard(
    chatId,
    `🔍 <b>Knowledge Search Results</b>\n\n${summary}`,
    { inline_keyboard: keyboardRows as any },
    env,
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
