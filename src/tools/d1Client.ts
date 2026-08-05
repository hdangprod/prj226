import type { Env } from '../config';

export interface PendingCapture {
  id: string;
  content: string;
  source: string;
  file_path: string;
  created_at: string;
  status?: string;
  organized_path?: string;
}

export interface Task {
  id: string;
  name: string;
  status: string;
  priority: string;
  estimate_hours: number | null;
  scheduled_date: string | null;
  depends_on: string[] | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionableTask {
  id: string;
  name: string;
  status: string;
  priority: string;
  estimate_hours: number | null;
  scheduled_date: string | null;
}

export interface WorkingMemory {
  id: string;
  last_action: string | null;
  doing: string | null;
  next_action: string | null;
  metadata: Record<string, unknown> | null;
  snapshot_at: string;
}

export interface NoteChunk {
  id: string;
  github_path: string;
  chunk_index: number;
  title: string | null;
  content: string;
  content_hash: string;
  tags: string | null;
  updated_at: string;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(JSON.stringify({ error: 'DB operation failed after retries', attempt, maxRetries }));
        throw err;
      }
      const baseMs = Math.pow(2, attempt) * 100;
      const jitter = Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, baseMs + jitter));
    }
  }
  throw new Error('Unreachable');
}

export class D1Client {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  // Idempotency
  async isProcessed(updateId: number): Promise<boolean> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare('SELECT update_id FROM processed_updates WHERE update_id = ?').bind(updateId);
      const res = await stmt.first();
      return !!res;
    });
  }

  async markProcessed(updateId: number): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare('INSERT OR IGNORE INTO processed_updates (update_id) VALUES (?)').bind(updateId);
      await stmt.run();
    });
  }

  // Pending Captures
  async createCapture(content: string, filePath: string): Promise<string> {
    return withRetry(async () => {
      const id = crypto.randomUUID();
      const stmt = this.env.DB.prepare(
        'INSERT INTO pending_captures (id, content, source, file_path) VALUES (?, ?, ?, ?)'
      ).bind(id, content, 'telegram', filePath);
      await stmt.run();
      return id;
    });
  }

  async getPendingCaptures(limit: number = 50): Promise<PendingCapture[]> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare("SELECT * FROM pending_captures WHERE status = 'raw' ORDER BY created_at ASC LIMIT ?").bind(limit);
      const res = await stmt.all<PendingCapture>();
      return res.results || [];
    });
  }

  async deletePendingCaptures(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    return withRetry(async () => {
      const placeholders = ids.map(() => '?').join(',');
      const stmt = this.env.DB.prepare(`DELETE FROM pending_captures WHERE id IN (${placeholders})`).bind(...ids);
      await stmt.run();
    });
  }

  // Tasks
  async createTask(params: { name: string; priority?: string; estimate_hours?: number | null; scheduled_date?: string | null; description?: string | null }): Promise<string> {
    return withRetry(async () => {
      const id = crypto.randomUUID();
      const stmt = this.env.DB.prepare(
        `INSERT INTO tasks (id, name, priority, estimate_hours, scheduled_date, description)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        params.name,
        params.priority || 'medium',
        params.estimate_hours ?? null,
        params.scheduled_date ?? null,
        params.description ?? null
      );
      await stmt.run();
      return id;
    });
  }

  async getActionableTasks(limit: number = 50): Promise<ActionableTask[]> {
    return withRetry(async () => {
      const allTasksStmt = this.env.DB.prepare('SELECT id, status FROM tasks');
      const allTasksRes = await allTasksStmt.all<{ id: string; status: string }>();
      const taskStatusMap = new Map((allTasksRes.results || []).map((t) => [t.id, t.status]));

      const notStartedStmt = this.env.DB.prepare("SELECT * FROM tasks WHERE status = 'not_started'");
      const notStartedRes = await notStartedStmt.all<{
        id: string;
        name: string;
        status: string;
        priority: string;
        estimate_hours: number | null;
        scheduled_date: string | null;
        depends_on: string | null;
      }>();
      const notStarted = notStartedRes.results || [];

      const actionable = notStarted.filter((task) => {
        if (!task.depends_on) return true;
        try {
          const deps: string[] = JSON.parse(task.depends_on);
          return deps.every((depId) => taskStatusMap.get(depId) === 'done');
        } catch (e) {
          return true; // if invalid JSON, treat as no valid dependencies
        }
      });

      const getPriorityVal = (p: string) => (p === 'high' ? 1 : p === 'medium' ? 2 : 3);
      actionable.sort((a, b) => {
        const pA = getPriorityVal(a.priority);
        const pB = getPriorityVal(b.priority);
        if (pA !== pB) return pA - pB;
        // fallback sort by id as created_at is not selected or guaranteed if not in DB res explicitly
        return a.id.localeCompare(b.id);
      });

      return actionable.slice(0, limit).map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        priority: t.priority,
        estimate_hours: t.estimate_hours,
        scheduled_date: t.scheduled_date,
      }));
    });
  }

  async getRescueTasks(maxHours: number = 1, limit: number = 10): Promise<ActionableTask[]> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        "SELECT id, name, status, priority, estimate_hours, scheduled_date FROM tasks WHERE status = 'not_started' AND estimate_hours <= ? ORDER BY estimate_hours ASC LIMIT ?"
      ).bind(maxHours, limit);
      const res = await stmt.all<ActionableTask>();
      return res.results || [];
    });
  }

  async findTasksByName(namePattern: string, limit: number = 10): Promise<Task[]> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        "SELECT * FROM tasks WHERE name LIKE ? AND status NOT IN ('done', 'archived') LIMIT ?"
      ).bind(`%${namePattern}%`, limit);
      const res = await stmt.all<any>();
      return (res.results || []).map((t) => ({
        ...t,
        depends_on: t.depends_on ? JSON.parse(t.depends_on) : null,
      }));
    });
  }

  async getDependentTasks(taskId: string): Promise<Array<{ id: string; name: string; scheduled_date: string | null }>> {
    return withRetry(async () => {
      // This is a naive filter because SQLite doesn't do JSON contains efficiently without json1 extension
      const stmt = this.env.DB.prepare('SELECT id, name, scheduled_date, depends_on FROM tasks');
      const res = await stmt.all<{ id: string; name: string; scheduled_date: string | null; depends_on: string | null }>();
      const tasks = res.results || [];
      return tasks.filter((t) => {
        if (!t.depends_on) return false;
        try {
          const deps: string[] = JSON.parse(t.depends_on);
          return deps.includes(taskId);
        } catch {
          return false;
        }
      }).map((t) => ({
        id: t.id,
        name: t.name,
        scheduled_date: t.scheduled_date,
      }));
    });
  }

  async rescheduleTask(taskId: string, newDate: string): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare('UPDATE tasks SET scheduled_date = ? WHERE id = ?').bind(newDate, taskId);
      await stmt.run();
    });
  }

  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare('UPDATE tasks SET status = ? WHERE id = ?').bind(status, taskId);
      await stmt.run();
    });
  }

  // Working Memory
  async getLatestWorkingMemory(): Promise<WorkingMemory | null> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare('SELECT * FROM working_memory ORDER BY snapshot_at DESC LIMIT 1');
      const res = await stmt.first<any>();
      if (!res) return null;
      return {
        ...res,
        metadata: res.metadata ? JSON.parse(res.metadata) : null,
      };
    });
  }

  async saveWorkingMemory(snapshot: { lastAction?: string; doing?: string; nextAction?: string; metadata?: Record<string, unknown> }): Promise<string> {
    return withRetry(async () => {
      const id = crypto.randomUUID();
      const metaStr = snapshot.metadata ? JSON.stringify(snapshot.metadata) : null;
      const stmt = this.env.DB.prepare(
        'INSERT INTO working_memory (id, last_action, doing, next_action, metadata) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, snapshot.lastAction ?? null, snapshot.doing ?? null, snapshot.nextAction ?? null, metaStr);
      await stmt.run();
      return id;
    });
  }

  // Note Chunks Cache
  async upsertNoteChunk(params: { id: string; githubPath: string; chunkIndex: number; title: string | null; content: string; contentHash: string; tags: string | null }): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        `INSERT INTO note_chunks_cache (id, github_path, chunk_index, title, content, content_hash, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, content=excluded.content, content_hash=excluded.content_hash, tags=excluded.tags, updated_at=CURRENT_TIMESTAMP`
      ).bind(
        params.id,
        params.githubPath,
        params.chunkIndex,
        params.title,
        params.content,
        params.contentHash,
        params.tags
      );
      await stmt.run();
    });
  }

  async deleteNoteChunksByPath(githubPath: string): Promise<string[]> {
    return withRetry(async () => {
      const selectStmt = this.env.DB.prepare('SELECT id FROM note_chunks_cache WHERE github_path = ?').bind(githubPath);
      const res = await selectStmt.all<{ id: string }>();
      const ids = (res.results || []).map((r) => r.id);

      if (ids.length > 0) {
        const deleteStmt = this.env.DB.prepare('DELETE FROM note_chunks_cache WHERE github_path = ?').bind(githubPath);
        await deleteStmt.run();
      }
      return ids;
    });
  }

  async getChunksByIds(ids: string[]): Promise<NoteChunk[]> {
    if (ids.length === 0) return [];
    return withRetry(async () => {
      const placeholders = ids.map(() => '?').join(',');
      const stmt = this.env.DB.prepare(`SELECT * FROM note_chunks_cache WHERE id IN (${placeholders})`).bind(...ids);
      const res = await stmt.all<NoteChunk>();
      return res.results || [];
    });
  }

  async getChunkHashesByPath(githubPath: string): Promise<Array<{ id: string; content_hash: string }>> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare('SELECT id, content_hash FROM note_chunks_cache WHERE github_path = ?').bind(githubPath);
      const res = await stmt.all<{ id: string; content_hash: string }>();
      return res.results || [];
    });
  }

  /**
   * Topic census: every distinct file that mentions the topic (FTS5 content match)
   * or whose path contains it (e.g. `tasks/2026-08-03-prj226-roadmap.md`). Returns
   * the "whole picture" of related sources, ranked by how many chunks matched.
   */
  async searchRelatedFiles(topic: string, ftsQuery: string, cap: number = 12): Promise<Array<{ github_path: string; matchCount: number }>> {
    return withRetry(async () => {
      const ftsClause = ftsQuery.trim()
        ? ` OR id IN (SELECT id FROM note_chunks_fts WHERE note_chunks_fts MATCH ?)`
        : '';
      const params: (string | number)[] = [`%${topic}%`];
      if (ftsQuery.trim()) params.push(ftsQuery);
      params.push(cap);

      const stmt = this.env.DB.prepare(
        `SELECT github_path, COUNT(*) AS match_count
         FROM note_chunks_cache
         WHERE github_path LIKE ?${ftsClause}
         GROUP BY github_path
         ORDER BY match_count DESC
         LIMIT ?`
      ).bind(...params);
      const res = await stmt.all<{ github_path: string; match_count: number }>();
      return (res.results || []).map((r) => ({ github_path: r.github_path, matchCount: Number(r.match_count) }));
    });
  }

  // FTS5 Search
  async ftsSearch(query: string, limit: number = 20): Promise<Array<{ id: string; title: string; rank: number }>> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        'SELECT id, title, bm25(note_chunks_fts) as rank FROM note_chunks_fts WHERE note_chunks_fts MATCH ? ORDER BY rank LIMIT ?'
      ).bind(query, limit);
      const res = await stmt.all<{ id: string; title: string; rank: number }>();
      return res.results || [];
    });
  }

  // Bulk FTS & Note Chunks Upsert (Bypasses SQLite FTS5 Auto-Sync Trigger contention)
  async bulkUpsertNoteChunksAndFts(
    chunks: Array<{
      id: string;
      githubPath: string;
      chunkIndex: number;
      title: string | null;
      content: string;
      contentHash: string;
      tags: string | null;
    }>
  ): Promise<void> {
    if (chunks.length === 0) return;
    return withRetry(async () => {
      const statements: D1PreparedStatement[] = [];
      for (const c of chunks) {
        statements.push(
          this.env.DB.prepare(
            `INSERT INTO note_chunks_cache (id, github_path, chunk_index, title, content, content_hash, tags)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
             title=excluded.title, content=excluded.content, content_hash=excluded.content_hash, tags=excluded.tags, updated_at=CURRENT_TIMESTAMP`
          ).bind(c.id, c.githubPath, c.chunkIndex, c.title, c.content, c.contentHash, c.tags)
        );
        statements.push(
          this.env.DB.prepare(
            `INSERT INTO note_chunks_fts (id, title, content)
             VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
             title=excluded.title, content=excluded.content`
          ).bind(c.id, c.title || '', c.content)
        );
      }
      const BATCH_LIMIT = 50;
      for (let i = 0; i < statements.length; i += BATCH_LIMIT) {
        const batchSlice = statements.slice(i, i + BATCH_LIMIT);
        await this.env.DB.batch(batchSlice);
      }
    });
  }

  // Durable Synchronous Raw Inbox Logs
  async saveRawInboxLog(updateId: number, payload: string): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        'INSERT OR IGNORE INTO raw_inbox_logs (update_id, payload, status) VALUES (?, ?, ?)'
      ).bind(updateId, payload, 'pending');
      await stmt.run();
    });
  }

  async markRawInboxLogStatus(updateId: number, status: 'processed' | 'failed', error?: string): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        'UPDATE raw_inbox_logs SET status = ?, error = ? WHERE update_id = ?'
      ).bind(status, error || null, updateId);
      await stmt.run();
    });
  }

  // Staging for Vectorize Deletions & Workers AI Embeddings Quota Fallback
  async stageFailedVectorDeletions(records: Array<{ vectorId: string; githubPath: string }>): Promise<void> {
    if (records.length === 0) return;
    return withRetry(async () => {
      const stmts = records.map((r) =>
        this.env.DB.prepare(
          'INSERT INTO pending_vector_deletions (id, vector_id, github_path) VALUES (?, ?, ?)'
        ).bind(crypto.randomUUID(), r.vectorId, r.githubPath)
      );
      await this.env.DB.batch(stmts);
    });
  }

  async stagePendingEmbedding(chunkId: string, content: string, githubPath: string): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        `INSERT OR REPLACE INTO pending_embeddings (chunk_id, content, github_path, status) VALUES (?, ?, ?, 'quota_deferred')`
      ).bind(chunkId, content, githubPath);
      await stmt.run();
    });
  }

  // Inbox Organize: get unprocessed raw/flushed inbox captures only
  async getInboxCaptures(limit: number = 5): Promise<PendingCapture[]> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        "SELECT * FROM pending_captures WHERE status IN ('raw','flushed') AND file_path LIKE 'inbox/%' AND needs_review = 1 ORDER BY created_at DESC LIMIT ?"
      ).bind(limit);
      const res = await stmt.all<PendingCapture>();
      return res.results || [];
    });
  }

  async getCaptureById(id: string): Promise<PendingCapture | null> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare('SELECT * FROM pending_captures WHERE id = ?').bind(id);
      return await stmt.first<PendingCapture>() ?? null;
    });
  }

  async updateCaptureStatus(id: string, status: string, organizedPath?: string): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare(
        'UPDATE pending_captures SET status = ?, organized_path = ?, needs_review = 0 WHERE id = ?'
      ).bind(status, organizedPath || null, id);
      await stmt.run();
    });
  }

  /** Marks a capture as successfully handled so it leaves the /inbox queue. */
  async markCaptureProcessed(id: string): Promise<void> {
    return withRetry(async () => {
      const stmt = this.env.DB.prepare('UPDATE pending_captures SET needs_review = 0 WHERE id = ?').bind(id);
      await stmt.run();
    });
  }

  async markCapturesFlushed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    return withRetry(async () => {
      const placeholders = ids.map(() => '?').join(',');
      const stmt = this.env.DB.prepare(
        `UPDATE pending_captures SET status = 'flushed' WHERE id IN (${placeholders})`
      ).bind(...ids);
      await stmt.run();
    });
  }

  // Health
  async ping(): Promise<boolean> {
    try {
      await withRetry(async () => {
        const stmt = this.env.DB.prepare('SELECT 1 as p');
        await stmt.first();
      });
      return true;
    } catch {
      return false;
    }
  }
}
