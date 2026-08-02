/**
 * PRJ226 v4.2: Inbox Organize Skill
 * Intent: Inbox_Organize
 *
 * Phase 1: Lists 5 latest raw inbox captures with action buttons.
 * Phase 2: AI-generates a structured knowledge note with [[WikiLinks]]
 *          to top-5 semantically related existing notes, then commits to GitHub.
 */

import type { Env } from '../config';
import type { SkillContext } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage, sendMessageWithKeyboard } from '../tools/telegramClient';
import { embedText } from '../lib/embeddings';
import { hybridSearch } from '../lib/hybridSearch';
import { batchCommitCaptures, deleteGitHubFile } from '../tools/gitBatchClient';
import { getLocalDate } from '../lib/dateUtils';

// ─── Phase 1: List Inbox Captures ─────────────────────────────────────────────

export async function handleInboxOrganize(ctx: SkillContext): Promise<void> {
  const { chatId, env } = ctx;
  const d1 = new D1Client(env);

  await sendMessage(chatId, '📥 <i>Fetching your latest inbox captures...</i>', env);

  const captures = await d1.getInboxCaptures(5);

  if (captures.length === 0) {
    await sendMessage(
      chatId,
      '✅ <b>Inbox is empty!</b>\n\nAll your captures have been organized. Great job keeping a clean inbox!',
      env,
    );
    return;
  }

  // Send each capture as a card with action buttons
  for (let i = 0; i < captures.length; i++) {
    const c = captures[i];
    const preview = c.content.length > 120
      ? c.content.substring(0, 120).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '...'
      : c.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const dateLabel = c.created_at?.substring(0, 16) || 'Unknown';
    const statusEmoji = c.status === 'flushed' ? '☁️' : '📝';

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🧠 Organize', callback_data: `organize:${c.id}` },
          { text: '➕ Task', callback_data: `task_from_inbox:${c.id}` },
          { text: '🗑️ Archive', callback_data: `archive_inbox:${c.id}` },
        ],
      ],
    };

    await sendMessageWithKeyboard(
      chatId,
      `${statusEmoji} <b>Inbox #${i + 1}</b>\n━━━━━━━━━━━━━━━━\n<i>${preview}</i>\n📅 ${dateLabel}`,
      keyboard,
      env,
    );
  }

  await sendMessage(
    chatId,
    `📋 Showing <b>${captures.length}</b> unorganized capture${captures.length > 1 ? 's' : ''}. Tap <b>🧠 Organize</b> to create a knowledge note with graph connections.`,
    env,
  );
}

// ─── Phase 2: Organize a Single Capture ───────────────────────────────────────

export async function handleOrganizeCapture(
  captureId: string,
  chatId: number,
  env: Env,
): Promise<void> {
  const d1 = new D1Client(env);
  const llm = new LLMRouter(env);

  const capture = await d1.getCaptureById(captureId);
  if (!capture) {
    await sendMessage(chatId, '❌ Capture not found. It may have already been organized.', env);
    return;
  }

  await sendMessage(chatId, '🔍 <i>Searching for related notes in your knowledge base...</i>', env);

  // 1. Find related existing notes via semantic search
  let relatedNotes: Array<{ title: string; path: string; score: number }> = [];
  try {
    const embedding = await embedText(capture.content, env);
    const searchResults = await hybridSearch(capture.content, embedding, env);

    if (searchResults.length > 0) {
      const chunks = await d1.getChunksByIds(searchResults.map((r) => r.id));
      relatedNotes = searchResults
        .map((r) => {
          const chunk = chunks.find((c) => c.id === r.id);
          if (!chunk) return null;
          const title = chunk.title || chunk.github_path.replace(/\.md$/, '').split('/').pop() || 'Untitled';
          return { title, path: chunk.github_path, score: Math.round(r.score * 100) };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null)
        .slice(0, 5);
    }
  } catch (err) {
    console.warn('[Inbox Organize] Semantic search failed, proceeding without connections:', err);
  }

  await sendMessage(chatId, '🤖 <i>Generating knowledge note with graph connections...</i>', env);

  // 2. AI synthesis: generate title, tags, category, and body with [[WikiLinks]]
  const relatedContext = relatedNotes.length > 0
    ? `\n\nRelated existing notes in the knowledge base:\n${relatedNotes.map((n, i) => `${i + 1}. [[${n.title}]] (file: ${n.path})`).join('\n')}`
    : '\n\nNo related existing notes found in the knowledge base yet.';

  const synthesisPrompt = `You are Liam, an AI second brain organizer. Given this raw inbox capture:

"${capture.content}"
${relatedContext}

Generate a structured knowledge note. Output in this EXACT format:
TITLE: <concise descriptive title>
CATEGORY: <one of: architecture, ideas, projects, learning, reference, personal>
TAGS: <comma-separated, 3-5 tags>
BODY:
<clean markdown body that:
- Expands on the raw thought with structure and clarity
- Weaves in [[WikiLinks]] to the related notes listed above where contextually relevant
- Uses headings, bullet points, and bold text for readability
- Keeps the original meaning and intent intact
>`;

  let title = 'Untitled Note';
  let category = 'reference';
  let tags: string[] = [];
  let body = capture.content;

  try {
    const aiRes = await llm.callFast(synthesisPrompt);
    const titleMatch = aiRes.match(/TITLE:\s*(.+)/i);
    const catMatch = aiRes.match(/CATEGORY:\s*(.+)/i);
    const tagsMatch = aiRes.match(/TAGS:\s*(.+)/i);
    const bodyMatch = aiRes.match(/BODY:\s*([\s\S]+)/i);

    if (titleMatch?.[1]) title = titleMatch[1].trim();
    if (catMatch?.[1]) {
      const cat = catMatch[1].trim().toLowerCase();
      if (['architecture', 'ideas', 'projects', 'learning', 'reference', 'personal'].includes(cat)) {
        category = cat;
      }
    }
    if (tagsMatch?.[1]) tags = tagsMatch[1].split(',').map((t) => t.trim().replace(/^#/, ''));
    if (bodyMatch?.[1]) body = bodyMatch[1].trim();
  } catch (err) {
    console.warn('[Inbox Organize] AI synthesis failed, using raw content:', err);
  }

  // 3. Store synthesis result in KV for approval callback
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
  const organizedPath = `wiki/${category}/${slug}.md`;

  const frontmatter = [
    '---',
    `title: "${title}"`,
    `tags: [${tags.map((t) => `"${t}"`).join(', ')}]`,
    `created: "${getLocalDate().dateStr}"`,
    `source: inbox`,
    ...(relatedNotes.length > 0
      ? [`related:\n${relatedNotes.map((n) => `  - "[[${n.title}]]"`).join('\n')}`]
      : []),
    '---',
    '',
  ].join('\n');

  const fullContent = frontmatter + body + '\n';

  // Store in KV for the approve callback to retrieve
  await env.SESSION_KV.put(
    `organize:${captureId}`,
    JSON.stringify({ title, category, tags, slug, organizedPath, fullContent, relatedNotes }),
    { expirationTtl: 3600 },
  );

  // 4. Send preview card
  const relatedDisplay = relatedNotes.length > 0
    ? `\n\n🔗 <b>Connected to Existing Notes:</b>\n${relatedNotes.map((n, i) => ` ${i === relatedNotes.length - 1 ? '└─' : '├─'} [[${escapeHtml(n.title)}]] (${n.score}%)`).join('\n')}`
    : '\n\n🔗 <i>No related notes found yet — this will be your first note in this topic!</i>';

  const tagDisplay = tags.length > 0 ? `\n🏷️ ${tags.map((t) => `#${t}`).join(' ')}` : '';

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Approve & Save', callback_data: `approve_organize:${captureId}` },
        { text: '❌ Cancel', callback_data: `cancel_organize:${captureId}` },
      ],
    ],
  };

  await sendMessageWithKeyboard(
    chatId,
    `🧠 <b>Proposed Knowledge Note</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n📌 <b>Title:</b> ${escapeHtml(title)}\n📂 <b>Path:</b> <code>${organizedPath}</code>${relatedDisplay}${tagDisplay}`,
    keyboard,
    env,
  );
}

// ─── Phase 3: Approve & Commit ────────────────────────────────────────────────

export async function handleApproveOrganize(
  captureId: string,
  chatId: number,
  env: Env,
): Promise<void> {
  const d1 = new D1Client(env);

  // Retrieve stored synthesis from KV
  const storedRaw = await env.SESSION_KV.get(`organize:${captureId}`);
  if (!storedRaw) {
    await sendMessage(chatId, '❌ Organization session expired. Please run /inbox again.', env);
    return;
  }

  const stored = JSON.parse(storedRaw) as {
    title: string;
    category: string;
    tags: string[];
    slug: string;
    organizedPath: string;
    fullContent: string;
    relatedNotes: Array<{ title: string; path: string; score: number }>;
  };

  await sendMessage(chatId, '💾 <i>Saving to your Second Brain...</i>', env);

  // 1. Commit organized note to GitHub
  try {
    const capture = await d1.getCaptureById(captureId);

    // Create the organized note via pending_captures + immediate flush
    await d1.createCapture(stored.fullContent, stored.organizedPath);
    const pending = await d1.getPendingCaptures(50);
    const organizeCapture = pending.find((p) => p.file_path === stored.organizedPath);
    if (organizeCapture) {
      await batchCommitCaptures([organizeCapture], env);
      await d1.updateCaptureStatus(organizeCapture.id, 'organized', stored.organizedPath);
    }

    // 2. Delete raw inbox file from GitHub
    if (capture?.file_path) {
      await deleteGitHubFile(capture.file_path, env);
    }

    // 3. Mark original capture as organized
    await d1.updateCaptureStatus(captureId, 'organized', stored.organizedPath);

    // 4. Index for search: chunk and upsert into D1 FTS + Vectorize
    try {
      const chunkId = crypto.randomUUID();
      await d1.bulkUpsertNoteChunksAndFts([{
        id: chunkId,
        githubPath: stored.organizedPath,
        chunkIndex: 0,
        title: stored.title,
        content: stored.fullContent,
        contentHash: await hashContent(stored.fullContent),
        tags: JSON.stringify(stored.tags),
      }]);

      // Embed into Vectorize
      const embedding = await embedText(stored.fullContent, env);
      await env.VECTORIZE.upsert([{
        id: chunkId,
        values: embedding,
        metadata: { title: stored.title, path: stored.organizedPath },
      }]);
    } catch (indexErr) {
      console.warn('[Inbox Organize] Indexing failed (will be picked up by reconcile cron):', indexErr);
    }

    // 5. Cleanup KV
    await env.SESSION_KV.delete(`organize:${captureId}`);

    // 6. Confirm
    const obsidianUrl = `obsidian://open?vault=hdangprod_wiki&file=${encodeURIComponent(stored.organizedPath.replace(/\.md$/, ''))}`;
    const relatedLinks = stored.relatedNotes.length > 0
      ? `\n\n🔗 Connected to: ${stored.relatedNotes.map((n) => `[[${escapeHtml(n.title)}]]`).join(', ')}`
      : '';

    await sendMessage(
      chatId,
      `✅ <b>Note saved & indexed!</b>\n\n📌 <b>${escapeHtml(stored.title)}</b>\n📂 <code>${stored.organizedPath}</code>${relatedLinks}\n\n🔍 Now searchable as <b>[[${escapeHtml(stored.title)}]]</b>\n📝 <a href="${obsidianUrl}">Open in Obsidian</a>`,
      env,
    );
  } catch (err) {
    console.error('[Inbox Organize] Commit failed:', err);
    await sendMessage(chatId, '⚠️ Failed to save note. Please try again.', env);
  }
}

// ─── Archive Handler ──────────────────────────────────────────────────────────

export async function handleArchiveInbox(
  captureId: string,
  chatId: number,
  env: Env,
): Promise<void> {
  const d1 = new D1Client(env);
  await d1.updateCaptureStatus(captureId, 'archived');
  await sendMessage(chatId, '🗑️ Capture archived.', env);
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}


