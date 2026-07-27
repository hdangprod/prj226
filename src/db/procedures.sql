-- PRJ226 v3.0: Neon Stored Procedures (Atomic RPCs)
-- Run AFTER schema.sql: psql $DATABASE_URL -f src/db/procedures.sql

-- ─── process_telegram_action ────────────────────────────────────────────────
-- Atomically marks a task done AND records the next working memory snapshot
-- Guarantees ACID compliance in a single HTTP round-trip via @neondatabase/serverless
CREATE OR REPLACE FUNCTION process_telegram_action(
  p_complete_task_id   UUID,
  p_next_task_name     TEXT,
  p_next_task_id       UUID,
  p_memory_snapshot    JSONB
) RETURNS JSONB AS $$
DECLARE
  v_completed_name TEXT;
  v_memory_id      UUID;
BEGIN
  -- Step 1: Mark task done
  UPDATE tasks
    SET status = 'done', updated_at = now()
    WHERE id = p_complete_task_id
    RETURNING name INTO v_completed_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task % not found', p_complete_task_id;
  END IF;

  -- Step 2: Insert working memory snapshot
  INSERT INTO working_memory (last_action, doing, next_action, metadata)
    VALUES (
      'completed: ' || v_completed_name,
      p_next_task_name,
      p_next_task_id::TEXT,
      p_memory_snapshot
    )
    RETURNING id INTO v_memory_id;

  RETURN jsonb_build_object(
    'success', true,
    'completed_task', v_completed_name,
    'memory_id', v_memory_id
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
  -- Transaction automatically rolls back on exception
END;
$$ LANGUAGE plpgsql;

-- ─── get_actionable_tasks ───────────────────────────────────────────────────
-- Returns tasks where all depends_on prerequisites are 'done'
-- Used by: dailyFocusSkill, rescheduleSkill
CREATE OR REPLACE FUNCTION get_actionable_tasks(
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  id             UUID,
  name           TEXT,
  status         TEXT,
  priority       TEXT,
  estimate_hours NUMERIC,
  scheduled_date DATE
) AS $$
BEGIN
  RETURN QUERY
    SELECT t.id, t.name, t.status, t.priority, t.estimate_hours, t.scheduled_date
    FROM tasks t
    WHERE t.status IN ('not_started', 'in_progress')
      AND (
        t.depends_on IS NULL
        OR array_length(t.depends_on, 1) = 0
        OR NOT EXISTS (
          SELECT 1 FROM tasks dep
          WHERE dep.id = ANY(t.depends_on)
            AND dep.status != 'done'
        )
      )
    ORDER BY
      CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      t.scheduled_date ASC NULLS LAST
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ─── get_rescue_tasks ───────────────────────────────────────────────────────
-- Returns quick-win tasks for low-energy rescue mode
-- Criteria: estimate_hours <= 0.5, status not done/archived, no blocked dependencies
CREATE OR REPLACE FUNCTION get_rescue_tasks(
  p_max_hours NUMERIC DEFAULT 0.5,
  p_limit     INTEGER DEFAULT 5
) RETURNS TABLE (
  id             UUID,
  name           TEXT,
  priority       TEXT,
  estimate_hours NUMERIC
) AS $$
BEGIN
  RETURN QUERY
    SELECT t.id, t.name, t.priority, t.estimate_hours
    FROM tasks t
    WHERE t.status IN ('not_started')
      AND t.estimate_hours <= p_max_hours
      AND (
        t.depends_on IS NULL
        OR array_length(t.depends_on, 1) = 0
        OR NOT EXISTS (
          SELECT 1 FROM tasks dep
          WHERE dep.id = ANY(t.depends_on)
            AND dep.status != 'done'
        )
      )
    ORDER BY t.estimate_hours ASC, CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ─── hybrid_search ──────────────────────────────────────────────────────────
-- Reciprocal Rank Fusion across notes_staging + knowledge_wiki
-- RRF Score(d) = 1/(60 + rank_staging) + 1/(60 + rank_wiki)
CREATE OR REPLACE FUNCTION hybrid_search(
  p_embedding  vector(768),
  p_k          INTEGER DEFAULT 5
) RETURNS TABLE (
  source       TEXT,
  id           UUID,
  title        TEXT,
  content      TEXT,
  rrf_score    FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH staging_ranked AS (
    SELECT
      'notes_staging' AS src,
      n.id,
      COALESCE(n.title, 'Untitled Note') AS title,
      n.raw_text AS content,
      ROW_NUMBER() OVER (ORDER BY n.embedding <=> p_embedding) AS rank
    FROM notes_staging n
    WHERE n.embedding IS NOT NULL
    LIMIT p_k * 3
  ),
  wiki_ranked AS (
    SELECT
      'knowledge_wiki' AS src,
      w.id,
      w.title,
      w.content,
      ROW_NUMBER() OVER (ORDER BY w.embedding <=> p_embedding) AS rank
    FROM knowledge_wiki w
    WHERE w.embedding IS NOT NULL
    LIMIT p_k * 3
  ),
  combined AS (
    SELECT src, id, title, content, 1.0 / (60.0 + rank) AS score FROM staging_ranked
    UNION ALL
    SELECT src, id, title, content, 1.0 / (60.0 + rank) AS score FROM wiki_ranked
  )
  SELECT
    c.src AS source,
    c.id,
    c.title,
    c.content,
    SUM(c.score) AS rrf_score
  FROM combined c
  GROUP BY c.src, c.id, c.title, c.content
  ORDER BY rrf_score DESC
  LIMIT p_k;
END;
$$ LANGUAGE plpgsql;
