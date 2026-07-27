/**
 * PRJ226 v3.0: Neon Serverless Postgres Client
 *
 * Uses @neondatabase/serverless HTTP driver — no TCP connections, edge-native.
 * Compatible with Cloudflare Workers without any Node.js polyfills.
 *
 * Features:
 *   - Typed query executor with automatic parameter binding
 *   - Atomic transaction wrapper
 *   - Hybrid RRF search across notes_staging + knowledge_wiki
 *   - Exponential backoff for transient DB errors
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { Env } from '../config';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'done' | 'on_hold' | 'archived';
  priority: 'high' | 'medium' | 'low';
  estimate_hours: number | null;
  scheduled_date: string | null;
  depends_on: string[] | null;
  project_id: string | null;
  notion_page_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkingMemory {
  id: string;
  last_action: string | null;
  doing: string | null;
  next_action: string | null;
  snapshot_at: string;
  metadata: Record<string, unknown> | null;
}

export interface NoteStaging {
  id: string;
  notion_page_id: string;
  title: string | null;
  raw_text: string;
  synced_at: string;
  source: string;
}

export interface WikiEntry {
  id: string;
  title: string;
  content: string;
  github_path: string | null;
  tags: string[] | null;
  synthesized_at: string;
}

export interface HybridSearchResult {
  source: 'notes_staging' | 'knowledge_wiki';
  id: string;
  title: string;
  content: string;
  rrf_score: number;
}

export interface ActionableTask {
  id: string;
  name: string;
  status: string;
  priority: string;
  estimate_hours: number | null;
  scheduled_date: string | null;
}

// ─── Retry Config ─────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [300, 600, 1200];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        console.warn(`[NeonClient] DB error, retrying in ${delay}ms (attempt ${attempt + 1}):`, err);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ─── NeonClient ───────────────────────────────────────────────────────────────

export class NeonClient {
  private readonly sql: NeonQueryFunction<false, false>;

  constructor(env: Env) {
    this.sql = neon(env.DATABASE_URL);
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────────

  /** Fetch actionable tasks where all dependencies are completed */
  async getActionableTasks(limit = 10): Promise<ActionableTask[]> {
    return withRetry(async () => {
      const rows = await this.sql`SELECT * FROM get_actionable_tasks(${limit})`;
      return rows as ActionableTask[];
    });
  }

  /** Get quick-win rescue tasks (estimate_hours ≤ maxHours) */
  async getRescueTasks(maxHours = 0.5, limit = 5): Promise<ActionableTask[]> {
    return withRetry(async () => {
      const rows = await this.sql`SELECT * FROM get_rescue_tasks(${maxHours}, ${limit})`;
      return rows as ActionableTask[];
    });
  }

  /** Mark a task done and record working memory atomically via RPC */
  async processTelegramAction(params: {
    completeTaskId: string;
    nextTaskName: string;
    nextTaskId: string;
    memorySnapshot: Record<string, unknown>;
  }): Promise<{ success: boolean; completed_task: string; memory_id: string }> {
    return withRetry(async () => {
      const rows = await this.sql`
        SELECT process_telegram_action(
          ${params.completeTaskId}::UUID,
          ${params.nextTaskName},
          ${params.nextTaskId}::UUID,
          ${JSON.stringify(params.memorySnapshot)}::JSONB
        ) AS result
      `;
      return rows[0].result as { success: boolean; completed_task: string; memory_id: string };
    });
  }

  /** Update a single task status */
  async updateTaskStatus(taskId: string, status: Task['status']): Promise<void> {
    return withRetry(async () => {
      await this.sql`
        UPDATE tasks SET status = ${status}, updated_at = now()
        WHERE id = ${taskId}::UUID
      `;
    });
  }

  // ─── Notes Staging ──────────────────────────────────────────────────────────

  /** Upsert a Notion page into notes_staging (Fast-Sync) */
  async upsertNote(params: {
    notionPageId: string;
    title: string | null;
    rawText: string;
    embedding?: number[];
  }): Promise<void> {
    return withRetry(async () => {
      if (params.embedding) {
        const embeddingLiteral = `[${params.embedding.join(',')}]`;
        await this.sql`
          INSERT INTO notes_staging (notion_page_id, title, raw_text, embedding, synced_at)
          VALUES (
            ${params.notionPageId},
            ${params.title},
            ${params.rawText},
            ${embeddingLiteral}::vector,
            now()
          )
          ON CONFLICT (notion_page_id) DO UPDATE SET
            title = EXCLUDED.title,
            raw_text = EXCLUDED.raw_text,
            embedding = EXCLUDED.embedding,
            synced_at = now()
        `;
      } else {
        await this.sql`
          INSERT INTO notes_staging (notion_page_id, title, raw_text, synced_at)
          VALUES (${params.notionPageId}, ${params.title}, ${params.rawText}, now())
          ON CONFLICT (notion_page_id) DO UPDATE SET
            title = EXCLUDED.title,
            raw_text = EXCLUDED.raw_text,
            synced_at = now()
        `;
      }
    });
  }

  // ─── Working Memory ─────────────────────────────────────────────────────────

  /** Get the most recent working memory snapshot */
  async getLatestWorkingMemory(): Promise<WorkingMemory | null> {
    return withRetry(async () => {
      const rows = await this.sql`
        SELECT * FROM working_memory
        ORDER BY snapshot_at DESC
        LIMIT 1
      `;
      return rows.length > 0 ? (rows[0] as WorkingMemory) : null;
    });
  }

  /** Save a new working memory snapshot */
  async saveWorkingMemory(snapshot: {
    lastAction?: string;
    doing?: string;
    nextAction?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    return withRetry(async () => {
      const rows = await this.sql`
        INSERT INTO working_memory (last_action, doing, next_action, metadata)
        VALUES (
          ${snapshot.lastAction ?? null},
          ${snapshot.doing ?? null},
          ${snapshot.nextAction ?? null},
          ${snapshot.metadata ? JSON.stringify(snapshot.metadata) : null}::JSONB
        )
        RETURNING id
      `;
      return rows[0].id as string;
    });
  }

  // ─── Hybrid Search (RRF) ─────────────────────────────────────────────────────

  /**
   * Reciprocal Rank Fusion search across notes_staging + knowledge_wiki.
   * RRF Score(d) = 1/(60 + rank_staging) + 1/(60 + rank_wiki)
   */
  async hybridSearch(embedding: number[], k = 5): Promise<HybridSearchResult[]> {
    return withRetry(async () => {
      const embeddingLiteral = `[${embedding.join(',')}]`;
      const rows = await this.sql`
        SELECT * FROM hybrid_search(${embeddingLiteral}::vector(768), ${k})
      `;
      return rows as HybridSearchResult[];
    });
  }

  // ─── Health Check ──────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      await this.sql`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  // ─── Raw Query (for skills that need custom SQL) ─────────────────────────────

  /**
   * Execute a raw parameterized SQL query.
   * Use this for queries not covered by the typed helper methods above.
   */
  async rawQuery<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> {
    return withRetry(async () => {
      const rows = await this.sql(strings, ...values);
      return rows as T[];
    });
  }

  // ─── Task Creation ──────────────────────────────────────────────────────────

  /** Create a new task and return its generated ID */
  async createTask(params: {
    name: string;
    priority?: 'high' | 'medium' | 'low';
    estimate_hours?: number | null;
    scheduled_date?: string | null;
    description?: string | null;
    notion_page_id?: string | null;
    project_id?: string | null;
  }): Promise<string> {
    return withRetry(async () => {
      const rows = await this.sql`
        INSERT INTO tasks (name, priority, estimate_hours, scheduled_date, description, notion_page_id, project_id)
        VALUES (
          ${params.name},
          ${params.priority ?? 'medium'},
          ${params.estimate_hours ?? null},
          ${params.scheduled_date ?? null},
          ${params.description ?? null},
          ${params.notion_page_id ?? null},
          ${params.project_id ?? null}
        )
        RETURNING id
      `;
      return rows[0].id as string;
    });
  }

  /** Find tasks matching a name pattern (for reschedule skill) */
  async findTasksByName(namePattern: string, limit = 3): Promise<Task[]> {
    return withRetry(async () => {
      const rows = await this.sql`
        SELECT id, name, status, priority, estimate_hours, scheduled_date,
               depends_on, project_id, notion_page_id, description, created_at, updated_at
        FROM tasks
        WHERE name ILIKE ${'%' + namePattern + '%'}
          AND status NOT IN ('done', 'archived')
        LIMIT ${limit}
      `;
      return rows as Task[];
    });
  }

  /** Get tasks that depend on a given task ID */
  async getDependentTasks(taskId: string): Promise<Array<{ id: string; name: string; scheduled_date: string | null }>> {
    return withRetry(async () => {
      const rows = await this.sql`
        SELECT id, name, scheduled_date
        FROM tasks
        WHERE ${taskId}::UUID = ANY(depends_on)
          AND status NOT IN ('done', 'archived')
      `;
      return rows as Array<{ id: string; name: string; scheduled_date: string | null }>;
    });
  }

  /** Update task scheduled_date */
  async rescheduleTask(taskId: string, newDate: string): Promise<void> {
    return withRetry(async () => {
      await this.sql`
        UPDATE tasks SET scheduled_date = ${newDate}, updated_at = now()
        WHERE id = ${taskId}::UUID
      `;
    });
  }
}
