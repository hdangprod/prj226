-- Migration 0005: Self-Evaluation Reflection Loop Tables
-- Stores evaluation traces for task generation quality tracking and nightly prompt optimization.

-- Evaluation history: one row per task capture that uses the reflection loop
CREATE TABLE IF NOT EXISTS eval_history (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  final_score REAL NOT NULL DEFAULT 0.0,
  passed INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual iterations within a reflection loop
CREATE TABLE IF NOT EXISTS eval_iterations (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL REFERENCES eval_history(id),
  iter_index INTEGER NOT NULL,
  draft TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0.0,
  criteria TEXT NOT NULL DEFAULT '{}',
  critique TEXT NOT NULL DEFAULT '',
  worst_item_index INTEGER NOT NULL DEFAULT -1
);

-- Nightly optimizer proposed prompt rule diffs
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  diff TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for query patterns
CREATE INDEX IF NOT EXISTS idx_eval_history_passed ON eval_history(passed);
CREATE INDEX IF NOT EXISTS idx_eval_history_created ON eval_history(created_at);
CREATE INDEX IF NOT EXISTS idx_eval_iterations_eval_id ON eval_iterations(eval_id);
