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
import { sendMessage, sendMessageWithKeyboard, escapeMarkdownV2 } from '../tools/telegramClient';
import { embedText } from '../lib/embeddings';
import { hybridSearch } from '../lib/hybridSearch';
import { extractSearchKeywords } from '../lib/querySanitizer';

const CENSUS_CAP = 13; // fetch cap+1 to detect truncation

export async function handleKnowledgeSearch(ctx: SkillContext): Promise<void> {
  const { chatId, userText, env } = ctx;
  const d1 = new D1Client(env);
  const llm = new LLMRouter(env);

  await sendMessage(chatId, '🔍 <i>Searching your knowledge base...</i>', env);

  // Normalize the conversational query into a clean topic + FTS-safe query
  const { cleanTopic, ftsQuery } = extractSearchKeywords(userText);
  const searchTopic = cleanTopic || userText;

  // Generate query embedding from the clean topic (not the full spoken phrase)
  const embedding = await embedText(searchTopic, env);

  // RRF hybrid search (FTS uses the sanitized OR-query so keyword hits surface too)
  await sendMessage(chatId, '🧠 <i>Calculating relevance scores...</i>', env);
  const results = await hybridSearch(searchTopic, embedding, env, ftsQuery);

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

  // Re-order chunks based on search result order and attach relevance percentage
  const orderedChunks = results
    .map(r => {
      const chunk = chunks.find(c => c.id === r.id);
      return chunk ? { ...chunk, relevancePercent: r.relevancePercent } : null;
    })
    .filter(c => c != null) as any[];

  // Topic census: every distinct file related to the topic (path + FTS match),
  // giving the user the "whole picture" of sources stored in their wiki.
  let relatedFiles: Array<{ github_path: string; matchCount: number }> = [];
  try {
    relatedFiles = await d1.searchRelatedFiles(searchTopic, ftsQuery, CENSUS_CAP);
  } catch (err) {
    console.warn(JSON.stringify({ warning: 'Topic census failed, falling back to top chunks only', error: String(err) }));
  }

  // "Best match" = the top ranked semantic chunks actually retrieved.
  // "Related files" = the whole-picture census of every file that touches the topic.
  // Reported separately so the user sees the primary answer distinct from the supporting set.
  const bestMatchCount = orderedChunks.length;
  const relatedCount = relatedFiles.length;

  // Synthesize a cited summary from the top semantic chunks
  const sourceContext = orderedChunks
    .map(
      (c, i) =>
        `[Source ${i + 1}] ${c.title || c.github_path || c.file_path || 'Untitled'}:\n${(c.content || '').substring(0, 300)}...`,
    )
    .join('\n\n');

  const summary = await llm.callPro(
    `The user asked: "${userText}"\nTopic: "${searchTopic}"\n\nRelevant sources:\n${sourceContext}\n\nWrite a concise summary (1-2 sentences). Bold key topics using <b>bold text</b>. Reference sources using [1], [2], etc.\n\nCRITICAL RULES:\n- Synthesize facts from the sources and reference them with [1], [2], etc.\n- Do NOT restate or invent a file/source count — the system states counts separately.\n- NEVER say "I have no information", "no details found", or "I currently have no information regarding X" when sources ARE listed!`,
  'You are Liam, a precise AI second brain. Always state clearly that results were found in the notes. Never claim no information exists when sources are provided.',
  );

  // Deterministic result acknowledgment — independent of LLM compliance, so the
  // user ALWAYS sees the actual result count even if the model denies having any.
  let ackParts = [`I found <b>${bestMatchCount}</b> ${bestMatchCount === 1 ? 'result' : 'results'} matching your prompt`];
  if (relatedCount > 0) {
    ackParts.push(`and <b>${relatedCount}</b> related ${relatedCount === 1 ? 'file' : 'files'}`);
  }
  const ackSentence = `${ackParts.join(' ')} about <b>${escapeHtml(searchTopic)}</b> in your wiki.`;

  // Strip any contradictory "no information / couldn't find / no results" phrasing
  // the model may produce despite results being present, so it cannot override reality.
  const synthesis = stripNoInformation(summary);
  const finalSummary = synthesis ? `${ackSentence}\n\n${synthesis}` : ackSentence;

  // Convert any Markdown **bold** or *bold* in synthesis to HTML <b>bold</b> for clean Telegram rendering
  const formattedSummary = finalSummary
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<b>$2</b>$3');

  // Build source links and callback keyboard (HTML)
  const keyboardRows: Array<Array<{ text: string; callback_data?: string }>> = [];
  let sourceLinks = '';
  let sourceIdx = 0;

  for (const c of orderedChunks.slice(0, 4)) {
    sourceIdx++;
    const filePath = c.github_path || c.file_path || '';
    
    let displayTitle = '';
    if (c.title) {
      displayTitle = c.title.length > 35 ? c.title.substring(0, 32) + '...' : c.title;
    } else if (filePath) {
      displayTitle = filePath;
    } else {
      displayTitle = 'Untitled Note';
    }

    const pctStr = c.relevancePercent ? ` (${c.relevancePercent}%)` : '';
    const formattedTitle = displayTitle.endsWith('.md') || displayTitle.includes('/') ? `<code>${escapeHtml(displayTitle)}</code>` : escapeHtml(displayTitle);

    sourceLinks += `\n📄 [${sourceIdx}] ${formattedTitle}${pctStr}`;
    
    const buttonTitle = displayTitle.length > 25 ? displayTitle.substring(0, 22) + '...' : displayTitle;
    keyboardRows.push([
      {
        text: `🔍 [${sourceIdx}] ${buttonTitle}${pctStr}`,
        callback_data: `view_chunk:${c.id}`,
      }
    ]);
  }

  // Whole-picture census: every related file rendered as a GitHub link
  let censusBlock = '';
  if (relatedFiles.length > 0) {
    const wikiBase = `https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/blob/main/`;
    const shown = relatedFiles.slice(0, 12);
    const lines = shown.map(
      (f) => `📄 <a href="${wikiBase}${encodeURI(f.github_path)}">${escapeHtml(f.github_path)}</a>`,
    );
    const truncated = relatedFiles.length > shown.length;
    censusBlock =
      `\n\n📚 <b>Related files (${relatedCount}):</b>\n${lines.join('\n')}` +
      (truncated ? `\n<i>+${relatedFiles.length - shown.length} more</i>` : '');
  }

  await sendMessageWithKeyboard(
    chatId,
    `🔍 <b>Knowledge Search Results</b>\n\n${formattedSummary}${sourceLinks ? `\n\n<b>Sources:</b>${sourceLinks}` : ''}${censusBlock}`,
    { inline_keyboard: keyboardRows as any },
    env,
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripNoInformation(text: string): string {
  return text
    .split('\n')
    .filter(
      line =>
        !/no (?:specific |further |prior |more )?information/i.test(line) &&
        !/nothing (?:found|to report|relevant)/i.test(line) &&
        !/(?:couldn'?t|cannot|can'?t|didn'?t|have no) (?:find|find anything|locate)/i.test(line) &&
        !/no (?:results?|details?) (?:were )?(?:found|available)/i.test(line),
    )
    .join('\n')
    .trim();
}
