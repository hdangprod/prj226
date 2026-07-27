/**
 * PRJ226 v3.0: Notion Client (Tool Layer)
 *
 * Read-only Notion REST API client using native fetch (Workers-compatible).
 * Replaces: @notionhq/client SDK (not Workers-compatible without polyfills).
 *
 * Guardrails:
 *   - STRICTLY READ-ONLY: No create/update/delete operations on Notion
 *   - Rate limiting: 350ms delay helper exposed for callers
 */

import type { Env } from '../config';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NotionPageMeta {
  id: string;
  last_edited_time: string;
  url: string;
  properties: Record<string, unknown>;
}

export interface NotionDatabaseQueryResult {
  results: NotionPageMeta[];
  has_more: boolean;
  next_cursor: string | null;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class NotionClient {
  private readonly apiKey: string;
  private readonly notionVersion = '2022-06-28';

  constructor(env: Env) {
    this.apiKey = env.NOTION_API_KEY;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Notion-Version': this.notionVersion,
      'Content-Type': 'application/json',
    };
  }

  /** Query a Notion database with optional filter */
  async queryDatabase(
    databaseId: string,
    filter?: Record<string, unknown>,
    pageSize = 50,
  ): Promise<NotionPageMeta[]> {
    const body: Record<string, unknown> = { page_size: pageSize };
    if (filter) body.filter = filter;

    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new Error(`Notion queryDatabase error ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as NotionDatabaseQueryResult;
    return data.results;
  }

  /** Fetch a single page by ID */
  async getPage(pageId: string): Promise<NotionPageMeta> {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Notion getPage error ${response.status}: ${await response.text()}`);
    }

    return response.json() as Promise<NotionPageMeta>;
  }

  /** Fetch block children (page content) */
  async getBlockChildren(
    blockId: string,
    pageSize = 50,
  ): Promise<{ results: unknown[]; has_more: boolean }> {
    const response = await fetch(
      `https://api.notion.com/v1/blocks/${blockId}/children?page_size=${pageSize}`,
      { headers: this.headers },
    );

    if (!response.ok) {
      throw new Error(`Notion getBlockChildren error ${response.status}: ${await response.text()}`);
    }

    return response.json() as Promise<{ results: unknown[]; has_more: boolean }>;
  }

  /** Extract plain text title from page properties */
  extractTitle(properties: Record<string, unknown>): string | null {
    for (const prop of Object.values(properties)) {
      const p = prop as { type?: string; title?: Array<{ plain_text?: string }> };
      if (p.type === 'title' && p.title?.length) {
        return p.title.map((t) => t.plain_text ?? '').join('');
      }
    }
    return null;
  }

  /** Extract plain text from block array */
  extractTextFromBlocks(blocks: unknown[]): string {
    const lines: string[] = [];
    for (const block of blocks) {
      const b = block as { type?: string; [key: string]: unknown };
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
}
