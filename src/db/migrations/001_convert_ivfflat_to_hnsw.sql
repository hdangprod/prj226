-- PRJ226 Migration 001: Convert vector indexes from IVFFLAT (lists = 100) to HNSW (vector_cosine_ops)
-- Goal: Fix low recall on small datasets (< 1,000 rows) by replacing IVFFLAT with HNSW indexes.
-- Run: psql $DATABASE_URL -f src/db/migrations/001_convert_ivfflat_to_hnsw.sql

DROP INDEX IF EXISTS idx_notes_staging_embedding;
DROP INDEX IF EXISTS idx_knowledge_wiki_embedding;

CREATE INDEX idx_notes_staging_embedding 
  ON notes_staging USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_knowledge_wiki_embedding 
  ON knowledge_wiki USING hnsw (embedding vector_cosine_ops);
