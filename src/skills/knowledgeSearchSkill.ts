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
    let captureId = ctx.captureId;
    if (!captureId) {
      try {
        const filePath = `inbox/cap_${Date.now()}.md`;
        captureId = await d1.createCapture(userText, filePath);
      } catch {
        // ignore capture creation error if fallback
      }
    }

    const shortText = userText.length > 80 ? userText.substring(0, 80) + '...' : userText;

    const keyboard = {
      inline_keyboard: [
        ...(captureId
          ? [
              [
                { text: '🧠 Organize Right Now', callback_data: `organize:${captureId}` },
                { text: '➕ Convert to Task', callback_data: `task_from_inbox:${captureId}` },
              ],
            ]
          : []),
        [{ text: '📋 Review Inbox', callback_data: 'intent:Inbox_Organize' }],
      ],
    };

    await sendMessageWithKeyboard(
      chatId,
      `📒 <b>No search results found</b>\n\nI couldn't find anything about <i>"${escapeHtml(shortText)}"</i> in your existing notes.\n\n📥 <b>Don't worry, your thought has been saved to your inbox!</b>\n\nWhat would you like to do with it?`,
      keyboard,
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

  // Build source links and callback keyboard
  const keyboardRows: Array<Array<{ text: string; callback_data?: string }>> = [];
  let sourceLinks = '';

  for (const c of orderedChunks.slice(0, 4)) {
    const titleText = c.title ? c.title.substring(0, 25) : c.file_path.substring(0, 25);
    const vault = 'hdangprod_wiki';
    const cleanPath = (c.file_path || '').replace(/\.md$/, '');
    const url = `obsidian://open?vault=${vault}&file=${encodeURIComponent(cleanPath)}`;

    sourceLinks += `\n• 📝 <a href="${url}">${titleText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`;
    keyboardRows.push([
      {
        text: `🔍 View snippet: ${titleText}`,
        callback_data: `view_chunk:${c.id}`,
      }
    ]);
  }

  await sendMessageWithKeyboard(
    chatId,
    `🔍 <b>Knowledge Search Results</b>\n\n${summary}${sourceLinks ? `\n\n<b>Sources:</b>${sourceLinks}` : ''}`,
    { inline_keyboard: keyboardRows as any },
    env,
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
