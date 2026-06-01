/**
 * Schema migration registry for memories.db.
 *
 * Each Migration is idempotent: the `pending` predicate checks current DB
 * state before `run` is called, so migrations are safe to re-run on every
 * backend connect.
 *
 * Add new migrations at the bottom of MIGRATIONS — never reorder or remove
 * existing entries (future migrations may depend on prior state).
 */
import type { Database } from 'better-sqlite3';

export interface Migration {
  readonly id: string;
  readonly description: string;
  pending(db: Database): boolean;
  run(db: Database): void;
}

export interface MigrationResult {
  id: string;
  description: string;
  status: 'applied' | 'skipped' | 'failed';
  error?: string;
}

function hasColumn(db: Database, table: string, column: string): boolean {
  const info = db.pragma(`table_info(${table})`) as { name: string }[];
  return info.some((c) => c.name === column);
}

function hasIndex(db: Database, table: string, name: string): boolean {
  const info = db.pragma(`index_list(${table})`) as { name: string }[];
  return info.some((i) => i.name === name);
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 'add_archived',
    description: 'Add archived column for soft-delete/archive tier (SLE-90)',
    pending: (db) => !hasColumn(db, 'memories', 'archived'),
    run: (db) => {
      db.prepare('ALTER TABLE memories ADD COLUMN archived INTEGER NOT NULL DEFAULT 0').run();
    },
  },
  {
    id: 'add_archive_note',
    description: 'Add archive_note column for tombstone data (SLE-90)',
    pending: (db) => !hasColumn(db, 'memories', 'archive_note'),
    run: (db) => {
      db.prepare('ALTER TABLE memories ADD COLUMN archive_note TEXT').run();
    },
  },
  {
    id: 'idx_memories_archived',
    description: 'Index memories.archived for query performance',
    pending: (db) => !hasIndex(db, 'memories', 'idx_memories_archived'),
    run: (db) => {
      db.prepare('CREATE INDEX idx_memories_archived ON memories(archived)').run();
    },
  },
];

/**
 * Apply pending migrations to a database.
 *
 * With strict: true (default), throws immediately on the first migration
 * failure — the database is in an unknown state and startup should abort.
 *
 * With strict: false, records the error and continues — useful for the CLI
 * migrate subcommand which wants to report all results before exiting.
 */
export function runMigrations(
  db: Database,
  opts: { strict?: boolean } = {},
): MigrationResult[] {
  const strict = opts.strict ?? true;
  const results: MigrationResult[] = [];

  for (const m of MIGRATIONS) {
    if (!m.pending(db)) {
      results.push({ id: m.id, description: m.description, status: 'skipped' });
      continue;
    }
    try {
      m.run(db);
      results.push({ id: m.id, description: m.description, status: 'applied' });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (strict) {
        throw new Error(`Migration '${m.id}' failed: ${error}`);
      }
      results.push({ id: m.id, description: m.description, status: 'failed', error });
    }
  }

  return results;
}

/** Return migrations that have not yet been applied, without touching the DB. */
export function pendingMigrations(db: Database): readonly Migration[] {
  return MIGRATIONS.filter((m) => m.pending(db));
}
