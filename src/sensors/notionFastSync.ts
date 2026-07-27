/**
 * PRJ226 v3.0: Notion Fast-Sync (Sensor Layer)
 *
 * Polls Notion for recently updated pages and upserts them into
 * Neon notes_staging table with vector embeddings.
 *
 * Triggered by:
 *   - Cloudflare Cron Trigger (every 1 minute via wrangler.toml)
 *   - POST /notion-sync (Notion webhook, if on Enterprise plan)
 *
 * Guardrails:
 *   - READ-ONLY: Never writes to Notion (anti-goal: no destructive Notion writes)
 *   - Rate limiting: 350ms delay between Notion API calls (3 req/s limit)
 *   - Processes only pages updated in the last 2 minutes (cron window)
 */

import type { Env } from '../config';
import { NeonClient } from '../tools/neonClient';
import { LLMRouter } from '../router/llmRouter';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncPayload {
  type: 'cron' | 'notion_webhook';
  pageId?: string;   // Provided by Notion webhook for targeted sync
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleNotionSync(body: unknown, env: Env): Promise<void> {
  const payload = body as SyncPayload;
  const neon = new NeonClient(env);
  const llm = new LLMRouter(env);

  if (payload.type === 'notion_webhook' && payload.pageId) {
    // Targeted sync for a specific page (Notion Enterprise webhook)
    await syncPage(payload.pageId, env, neon, llm);
  } else {
    // Cron: poll for pages updated in the last 2 minutes
    await pollRecentPages(env, neon, llm);
  }
}

// ─── Poll Recent Pages ────────────────────────────────────────────────────────

async function pollRecentPages(env: Env, neon: NeonClient, llm: LLMRouter): Promise<void> {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Query all Notion databases for recently edited pages
  const dbIds = [
    env.NOTION_TASKS_DB_ID,
    env.NOTION_PROJECTS_DB_ID,
    env.NOTION_AREAS_DB_ID,
    env.NOTION_RESOURCES_DB_ID,
    env.NOTION_DAILY_LOGS_DB_ID,
  ].filter(Boolean);

  for (const dbId of dbIds) {
    try {
      const pages = await queryNotionDatabase(dbId, twoMinutesAgo, env);
      for (const page of pages) {
        await syncPage(page.id, env, neon, llm);
        // Rate limit: 350ms between API calls
        await delay(350);
      }
    } catch (err) {
      console.error(`[NotionFastSync] Error polling DB ${dbId}:`, err);
    }
  }
}

// ─── Sync a Single Page ──────────────────────────────────────────────────────

async function syncPage(
  pageId: string,
  env: Env,
  neon: NeonClient,
  llm: LLMRouter,
): Promise<void> {
  try {
    // Fetch page content from Notion (read-only)
    const { title, rawText } = await fetchNotionPageContent(pageId, env);

    if (!rawText.trim()) {
      console.log(`[NotionFastSync] Page ${pageId} has no text content. Skipping.`);
      return;
    }

    // Generate embedding for semantic search
    const embedding = await llm.embedText(rawText.substring(0, 2000)); // Trim for token limit

    // Upsert into Neon notes_staging
    await neon.upsertNote({ notionPageId: pageId, title, rawText, embedding });
    console.log(`[NotionFastSync] Synced page ${pageId}: "${title ?? 'Untitled'}"`);
  } catch (err) {
    console.error(`[NotionFastSync] Failed to sync page ${pageId}:`, err);
  }
}

// ─── Notion API Helpers ───────────────────────────────────────────────────────

interface NotionPage {
  id: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
}

async function queryNotionDatabase(
  dbId: string,
  lastEditedAfter: string,
  env: Env,
): Promise<NotionPage[]> {
  const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        timestamp: 'last_edited_time',
        last_edited_time: { after: lastEditedAfter },
      },
      page_size: 10,
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { results: NotionPage[] };
  return data.results ?? [];
}

async function fetchNotionPageContent(
  pageId: string,
  env: Env,
): Promise<{ title: string | null; rawText: string }> {
  // Fetch page metadata (title)
  const pageResp = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
    },
  });

  if (!pageResp.ok) throw new Error(`Page fetch failed: ${pageResp.status}`);
  const page = (await pageResp.json()) as { properties: Record<string, unknown> };

  // Extract title from page properties
  const title = extractTitle(page.properties);

  // Fetch page blocks (content)
  const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=50`, {
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
    },
  });

  if (!blocksResp.ok) throw new Error(`Blocks fetch failed: ${blocksResp.status}`);
  const blocks = (await blocksResp.json()) as { results: unknown[] };

  const rawText = extractTextFromBlocks(blocks.results);
  return { title, rawText };
}

// ─── Text Extraction Helpers ──────────────────────────────────────────────────

function extractTitle(properties: Record<string, unknown>): string | null {
  for (const prop of Object.values(properties)) {
    const p = prop as { type?: string; title?: Array<{ plain_text?: string }> };
    if (p.type === 'title' && p.title?.length) {
      return p.title.map((t) => t.plain_text ?? '').join('');
    }
  }
  return null;
}

function extractTextFromBlocks(blocks: unknown[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const b = block as {
      type?: string;
      [key: string]: unknown;
    };

    const type = b.type;
    if (!type) continue;

    const content = b[type] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
    if (content?.rich_text?.length) {
      const text = content.rich_text.map((rt) => rt.plain_text ?? '').join('');
      if (text.trim()) lines.push(text);
    }
  }

  return lines.join('\n');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
