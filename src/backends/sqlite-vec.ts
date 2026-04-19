/**
 * SQLite + sqlite-vec memory backend.
 *
 * A single file holds all memories plus their embedding vectors.
 * No external service, no daemon. Portable to any machine with Node.
 *
 * Schema:
 *   memories       — regular table, one row per memory (payload, TTL, etc.)
 *   vec_memories   — sqlite-vec virtual table, rowid = memories.id
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type {
  MemoryBackend,
  MemoryInput,
  MemoryRef,
  RecallInput,
  MemoryMatch,
  ForgetInput,
  ForgetResult,
  UpdateInput,
  UpdateResult,
  PruneResult,
  ListInput,
  MemoryEntry,
  EmbeddingProvider,
} from './types.js';
import { computeExpiresAt, isExpired } from './ttl.js';
import { globToMatcher } from './glob.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export interface SqliteVecConfig {
  /** Absolute path to the SQLite database file */
  dbPath: string;
}

interface MemoryRow {
  id: number;
  uuid: string;
  ref: string;
  title: string;
  category: string;
  project: string | null;
  content: string;
  metadata: string;
  created: string;
  updated: string | null;
  last_accessed: string | null;
  ttl: string | null;
  expires_at: string | null;
}

interface VecMatch {
  rowid: number;
  distance: number;
}

export class SqliteVecBackend implements MemoryBackend {
  private readonly db: Database;

  constructor(
    private readonly config: SqliteVecConfig,
    private readonly embedder: EmbeddingProvider,
  ) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    this.db = new BetterSqlite3(config.dbPath);
    this.db.pragma('journal_mode = WAL');
    sqliteVec.load(this.db);
    this.initSchema();
  }

  // ── MemoryBackend interface ──

  async remember(input: MemoryInput): Promise<MemoryRef> {
    const uuid = randomUUID();
    const timestamp = new Date().toISOString();
    const slug = slugify(input.title);
    const ref = `${input.category}/${slug}-${uuid.slice(0, 8)}`;
    const expiresAt = computeExpiresAt(timestamp, input.ttl);

    const vector = await this.embedder.embed(`${input.title}\n\n${input.content}`);

    const insertMem = this.db.prepare(`
      INSERT INTO memories (
        uuid, ref, title, category, project, content, metadata,
        created, ttl, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVec = this.db.prepare(
      'INSERT INTO vec_memories(rowid, embedding) VALUES (?, ?)',
    );

    const tx = this.db.transaction(() => {
      const result = insertMem.run(
        uuid,
        ref,
        input.title,
        input.category,
        input.project ?? null,
        input.content,
        JSON.stringify(input.metadata ?? {}),
        timestamp,
        input.ttl ?? null,
        expiresAt,
      );
      insertVec.run(BigInt(result.lastInsertRowid), toVecBuffer(vector));
    });
    tx();

    return {
      ref,
      category: input.category,
      filename: `${slug}-${uuid.slice(0, 8)}`,
      title: input.title,
    };
  }

  async recall(input: RecallInput): Promise<MemoryMatch[]> {
    const limit = input.limit ?? 10;
    const fetchK = limit * 4;

    const queryVector = await (this.embedder.embedQuery?.(input.query) ??
      this.embedder.embed(input.query));

    const vecRows = this.db
      .prepare(
        `SELECT rowid, distance FROM vec_memories
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      )
      .all(toVecBuffer(queryVector), fetchK) as VecMatch[];

    if (vecRows.length === 0) return [];

    const placeholders = vecRows.map(() => '?').join(',');
    const memRows = this.db
      .prepare(`SELECT * FROM memories WHERE id IN (${placeholders})`)
      .all(...vecRows.map((r) => r.rowid)) as MemoryRow[];

    const byId = new Map(memRows.map((r) => [r.id, r]));
    const categoryFilter =
      input.category && input.category !== 'all' ? input.category : null;
    const projectFilter = input.project ?? null;

    const results: MemoryMatch[] = [];
    const hitIds: number[] = [];
    for (const vr of vecRows) {
      const mem = byId.get(vr.rowid);
      if (!mem) continue;
      if (categoryFilter && mem.category !== categoryFilter) continue;
      if (projectFilter && mem.project !== projectFilter) continue;

      results.push(rowToMatch(mem, vr.distance));
      hitIds.push(mem.id);
      if (results.length >= limit) break;
    }

    if (hitIds.length > 0) {
      const now = new Date().toISOString();
      const stamp = this.db.prepare(
        'UPDATE memories SET last_accessed = ? WHERE id = ?',
      );
      const tx = this.db.transaction((ids: number[]) => {
        for (const id of ids) stamp.run(now, id);
      });
      tx(hitIds);
    }

    return results;
  }

  async forget(input: ForgetInput): Promise<ForgetResult> {
    if (input.ref) {
      const row = this.db
        .prepare('SELECT id, ref FROM memories WHERE ref = ?')
        .get(input.ref) as { id: number; ref: string } | undefined;
      if (!row) return { deleted: [] };
      this.deleteById([row.id]);
      return { deleted: [row.ref] };
    }

    if (input.category && input.title && !input.title_pattern) {
      const rows = this.db
        .prepare(
          'SELECT id, ref FROM memories WHERE category = ? AND title = ?',
        )
        .all(input.category, input.title) as { id: number; ref: string }[];
      if (rows.length === 0) return { deleted: [] };
      this.deleteById(rows.map((r) => r.id));
      return { deleted: rows.map((r) => r.ref) };
    }

    const clauses: string[] = [];
    const params: string[] = [];
    if (input.category) {
      clauses.push('category = ?');
      params.push(input.category);
    }
    if (input.project) {
      clauses.push('project = ?');
      params.push(input.project);
    }
    if (clauses.length === 0) return { deleted: [] };

    const all = this.db
      .prepare(
        `SELECT id, ref, title FROM memories WHERE ${clauses.join(' AND ')}`,
      )
      .all(...params) as { id: number; ref: string; title: string }[];

    let targets = all;
    if (input.title_pattern) {
      const matcher = globToMatcher(input.title_pattern);
      targets = all.filter((r) => matcher(r.title));
    }

    if (targets.length === 0) return { deleted: [] };
    this.deleteById(targets.map((r) => r.id));
    return { deleted: targets.map((r) => r.ref) };
  }

  async update(input: UpdateInput): Promise<UpdateResult> {
    let row: MemoryRow | undefined;
    if (input.ref) {
      row = this.db
        .prepare('SELECT * FROM memories WHERE ref = ?')
        .get(input.ref) as MemoryRow | undefined;
    } else if (input.category && input.title) {
      row = this.db
        .prepare('SELECT * FROM memories WHERE category = ? AND title = ?')
        .get(input.category, input.title) as MemoryRow | undefined;
    } else {
      return { updated: false };
    }

    if (!row) return { updated: false };

    const newContent = input.content ?? row.content;
    const existingMeta = JSON.parse(row.metadata) as Record<string, unknown>;
    const newMeta = input.metadata
      ? { ...existingMeta, ...input.metadata }
      : existingMeta;
    const updatedAt = new Date().toISOString();

    const updateStmt = this.db.prepare(`
      UPDATE memories
      SET content = ?, metadata = ?, updated = ?
      WHERE id = ?
    `);
    const updateVec = this.db.prepare(
      'UPDATE vec_memories SET embedding = ? WHERE rowid = ?',
    );

    const vector = await this.embedder.embed(`${row.title}\n\n${newContent}`);

    const tx = this.db.transaction(() => {
      updateStmt.run(newContent, JSON.stringify(newMeta), updatedAt, row!.id);
      updateVec.run(toVecBuffer(vector), BigInt(row!.id));
    });
    tx();

    return { updated: true, ref: row.ref };
  }

  async prune(options?: {
    dryRun?: boolean;
    staleDays?: number;
  }): Promise<PruneResult> {
    const dryRun = options?.dryRun ?? false;
    const staleDays = options?.staleDays ?? 30;
    const now = new Date();
    const staleThreshold = new Date(
      now.getTime() - staleDays * 24 * 60 * 60 * 1000,
    );

    const rows = this.db
      .prepare(
        `SELECT id, ref, ttl, expires_at, last_accessed, updated, created
         FROM memories`,
      )
      .all() as {
      id: number;
      ref: string;
      ttl: string | null;
      expires_at: string | null;
      last_accessed: string | null;
      updated: string | null;
      created: string;
    }[];

    const expired: string[] = [];
    const stale: string[] = [];
    const expiredIds: number[] = [];

    for (const r of rows) {
      if (r.expires_at && isExpired(r.expires_at, now)) {
        expired.push(r.ref);
        expiredIds.push(r.id);
        continue;
      }
      if (r.ttl === 'permanent') continue;
      const lastTouch = r.last_accessed ?? r.updated ?? r.created;
      if (new Date(lastTouch) < staleThreshold) {
        stale.push(r.ref);
      }
    }

    if (!dryRun && expiredIds.length > 0) {
      this.deleteById(expiredIds);
    }

    return { expired, stale };
  }

  async list(input: ListInput): Promise<MemoryEntry[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.category) {
      clauses.push('category = ?');
      params.push(input.category);
    }
    if (input.project) {
      clauses.push('project = ?');
      params.push(input.project);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(input.limit ?? 50);

    const rows = this.db
      .prepare(
        `SELECT ref, title, category, project, created
         FROM memories ${where}
         ORDER BY created DESC LIMIT ?`,
      )
      .all(...params) as {
      ref: string;
      title: string;
      category: string;
      project: string | null;
      created: string;
    }[];

    return rows.map((r) => ({
      ref: r.ref,
      title: r.title,
      category: r.category,
      project: r.project ?? undefined,
      created: r.created,
    }));
  }

  close(): void {
    this.db.close();
  }

  getDatabase(): Database {
    return this.db;
  }

  // ── Internals ──

  private initSchema(): void {
    const statements = [
      `CREATE TABLE IF NOT EXISTS memories (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid          TEXT NOT NULL UNIQUE,
        ref           TEXT NOT NULL UNIQUE,
        title         TEXT NOT NULL,
        category      TEXT NOT NULL,
        project       TEXT,
        content       TEXT NOT NULL,
        metadata      TEXT NOT NULL DEFAULT '{}',
        created       TEXT NOT NULL,
        updated       TEXT,
        last_accessed TEXT,
        ttl           TEXT,
        expires_at    TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_project  ON memories(project)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_ref      ON memories(ref)`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
        embedding float[${this.embedder.dimensions}] distance_metric=cosine
      )`,
    ];
    for (const sql of statements) {
      this.db.prepare(sql).run();
    }
  }

  private deleteById(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    const delMem = this.db.prepare(
      `DELETE FROM memories WHERE id IN (${placeholders})`,
    );
    const delVec = this.db.prepare(
      `DELETE FROM vec_memories WHERE rowid IN (${placeholders})`,
    );
    const bigIds = ids.map((n) => BigInt(n));
    const tx = this.db.transaction(() => {
      delMem.run(...ids);
      delVec.run(...bigIds);
    });
    tx();
  }
}

// ── Helpers ──

function toVecBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function rowToMatch(row: MemoryRow, distance: number): MemoryMatch {
  return {
    path: row.ref,
    title: row.title,
    category: row.category,
    project: row.project ?? undefined,
    created: row.created,
    content: row.content,
    relevance: 1 - distance,
    lastAccessed: row.last_accessed ?? undefined,
    ttl: row.ttl ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  };
}
