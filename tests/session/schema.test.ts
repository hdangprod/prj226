import { Harness } from './harness';
import { SESSION_DDL } from '../../src/session/sqliteRepository';

export async function run(h: Harness): Promise<void> {
  const ddl = SESSION_DDL;

  // Required tables
  const tables = ['sessions', 'inbound_events', 'turns', 'turn_fragments', 'scheduled_jobs'];
  for (const t of tables) {
    h.assert(ddl.includes(`CREATE TABLE IF NOT EXISTS ${t} (`), `${t} table defined in DDL`);
  }

  // One active session per scope (partial unique index).
  h.assert(
    /CREATE UNIQUE INDEX[^;]*idx_sessions_one_active[^;]*WHERE status = 'active'/.test(ddl),
    'partial unique index enforces one active session',
  );

  // One processing turn at a time per session.
  h.assert(
    /CREATE UNIQUE INDEX[^;]*idx_turns_one_processing[^;]*WHERE status = 'processing'/.test(ddl),
    'partial unique index enforces one processing turn',
  );

  // Seq uniqueness within a session (INV-03: no two turns same seq).
  h.assert(/UNIQUE \(session_id, seq\)/.test(ddl), 'turns enforce UNIQUE(session_id, seq)');

  // update_id is the inbound primary key (dedupe).
  h.assert(/update_id INTEGER PRIMARY KEY/.test(ddl), 'inbound event dedupes on update_id');

  // Job scheduling index.
  h.assert(/idx_jobs_due/.test(ddl), 'scheduled_jobs indexed by due time');

  // Status integrity uses CHECK constraints.
  h.assert(/status TEXT NOT NULL CHECK \(status IN \('active','closing','closed'\)\)/.test(ddl), 'session status constrained');
}

export default run;