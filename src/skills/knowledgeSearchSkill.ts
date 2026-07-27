/**
 * PRJ226 v3.0: Knowledge Search Skill
 * Intent: Knowledge_Search
 *
 * Executes Hybrid RAG search using Reciprocal Rank Fusion (RRF) across:
 *   - notes_staging (real-time raw Notion data)
 *   - knowledge_wiki (OpenWiki OKF synthesized entries)
 *
 * Returns a cited summary with inline Telegram action buttons for source access.
 */

import type { SkillContext } from '../governance/intentRouter';
import { NeonClient } from '../tools/neonClient';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage, sendMessageWithKeyboard } from '../tools/telegramClient';

export async function handleKnowledgeSearch(ctx: SkillContext): Promise<void> {
  const { chatId, userText, env } = ctx;
  const neon = new NeonClient(env);
  const llm = new LLMRouter(env);

  await sendMessage(chatId, '🔍 <i>Searching your knowledge base...</i>', env);

  // Generate query embedding
  const embedding = await llm.embedText(userText);

  // RRF hybrid search
  await sendMessage(chatId, '🧠 <i>Calculating relevance scores...</i>', env);
  const results = await neon.hybridSearch(embedding, 5);

  if (results.length === 0) {
    await sendMessage(
      chatId,
      `📒 <b>No results found</b>\n\nI couldn't find anything about "${escapeHtml(userText)}" in your notes or wiki yet.`,
      env,
    );
    return;
  }

  // Synthesize a cited summary
  const sourceContext = results
    .map(
      (r, i) =>
        `[Source ${i + 1} — ${r.source === 'notes_staging' ? 'Notion Note' : 'Wiki'}] ${r.title}:\n${r.content.substring(0, 300)}...`,
    )
    .join('\n\n');

  const summary = await llm.callPro(
    `The user asked: "${userText}"\n\nRelevant sources found:\n${sourceContext}\n\nWrite a concise, cited answer (2-3 sentences) referencing the source numbers. Use HTML formatting.`,
    'You are Liam, a precise AI second brain. Answer grounded in the provided sources only. Do not hallucinate.',
  );

  // Build inline keyboard for source links
  const notionResults = results.filter((r) => r.source === 'notes_staging').slice(0, 2);
  const wikiResults = results.filter((r) => r.source === 'knowledge_wiki').slice(0, 2);

  const keyboardRows: Array<Array<{ text: string; callback_data: string }>> = [];

  if (notionResults.length > 0) {
    keyboardRows.push(
      notionResults.map((r) => ({
        text: `📝 ${r.title.substring(0, 20)}`,
        callback_data: `view_notion:${r.id}`,
      })),
    );
  }
  if (wikiResults.length > 0) {
    keyboardRows.push(
      wikiResults.map((r) => ({
        text: `📖 ${r.title.substring(0, 20)}`,
        callback_data: `view_wiki:${r.id}`,
      })),
    );
  }

  await sendMessageWithKeyboard(
    chatId,
    `🔍 <b>Knowledge Search Results</b>\n\n${summary}`,
    { inline_keyboard: keyboardRows },
    env,
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
