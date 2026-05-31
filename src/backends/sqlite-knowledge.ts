/**
 * SQLite knowledge backend — isolated from the memory wing.
 *
 * This backend opens a separate knowledge.db file, never loads sqlite-vec,
 * and never touches memories.db. It follows the frozen v1 schema (§B) from
 * the hardened design: pages + citations tables, PRAGMA user_version = 1,
 * WAL mode, close-in-finally pattern.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import type {
  KnowledgeBackend,
  KnowledgePageInput,
  KnowledgeCitationInput,
  KnowledgePage,
  KnowledgeCitation,
  KnowledgePageWithCitations,
  KnowledgeQueryInput,
  KnowledgeWriteResult,
} from './types.js';

/** Hard size caps — enforced at write boundary (design §A3). */
const MAX_PAGE_BODY_LENGTH = 64 * 1024; // 64 KB
const MAX_CITATION_EXCERPT_LENGTH = 4096; // 4 KB

export interface SqliteKnowledgeConfig {
  /** Absolute path to the knowledge SQLite database file */
  dbPath: string;
}

export class SqliteKnowledgeBackend implements KnowledgeBackend {
  private db: Database | null = null;

  constructor(private readonly config: SqliteKnowledgeConfig) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    // Open in constructor for schema init; caller closes after use.
    this.db = new BetterSqlite3(config.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('user_version = 1');
    this.initSchema();
  }

  // ── KnowledgeBackend interface ──

  writePage(input: KnowledgePageInput): Promise<KnowledgeWriteResult> {
    try {
      enforcePageBodyCap(input.body);

      const db = this.ensureOpen();
      const timestamp = new Date().toISOString();

      const existing = db.prepare(
        'SELECT id, uuid, title FROM pages WHERE slug = ?',
      ).get(input.slug) as { id: number; uuid: string; title: string } | undefined;

      let pageId: number;
      let uuid: string;
      let title: string;
      let sourcing: string;

      if (existing) {
        uuid = existing.uuid;
        title = existing.title;
        sourcing = input.sourcing ?? 'sourced';
        pageId = existing.id;

        db.prepare(
          `UPDATE pages SET body = ?, sourcing = ?, updated = ? WHERE id = ?`,
        ).run(input.body, sourcing, timestamp, pageId);
      } else {
        uuid = randomUUID();
        title = input.title;
        sourcing = input.sourcing ?? 'sourced';
        const result = db.prepare(
          `INSERT INTO pages (uuid, slug, title, domain, body, sourcing, provenance, created, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          uuid,
          input.slug,
          title,
          input.domain,
          input.body,
          sourcing,
          input.provenance ?? null,
          timestamp,
          timestamp,
        );
        pageId = Number(result.lastInsertRowid);
      }

      let citationsAdded = 0;
      if (input.citations && input.citations.length > 0) {
        for (const cit of input.citations) {
          enforceExcerptCap(cit.excerpt);
        }

        const insertCit = db.prepare(
          `INSERT INTO citations (page_id, claim, source_kind, source_locator, excerpt, retrieved_at, created)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        const tx = db.transaction(() => {
          for (const cit of input.citations!) {
            insertCit.run(
              pageId,
              cit.claim,
              cit.source_kind,
              cit.source_locator ?? null,
              cit.excerpt,
              timestamp,
              timestamp,
            );
            citationsAdded++;
          }
        });
        tx();
      }

      return Promise.resolve({
        uuid,
        slug: input.slug,
        title,
        citationsAdded,
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  getPage(slug: string): Promise<KnowledgePageWithCitations | null> {
    try {
      const db = this.ensureOpen();

      const page = db.prepare(
        'SELECT * FROM pages WHERE slug = ?',
      ).get(slug) as KnowledgePage | undefined;

      if (!page) return Promise.resolve(null);

      const citations = db.prepare(
        'SELECT * FROM citations WHERE page_id = ? ORDER BY id',
      ).all(page.id) as KnowledgeCitation[];

      return Promise.resolve({ ...page, citations });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  listPages(input?: KnowledgeQueryInput): Promise<KnowledgePageWithCitations[]> {
    try {
      const db = this.ensureOpen();
      const limit = input?.limit ?? 50;

      const clauses: string[] = [];
      const params: unknown[] = [];

      if (input?.excludeStatus) {
        clauses.push('status != ?');
        params.push(input.excludeStatus);
      }

      if (input?.domain) {
        clauses.push("domain LIKE ?");
        params.push(`${input.domain}/%`);
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      params.push(limit);

      const rows = db.prepare(
        `SELECT * FROM pages ${where} ORDER BY updated DESC, created DESC LIMIT ?`,
      ).all(...params) as KnowledgePage[];

      return Promise.resolve(rows.map((page) => ({
        ...page,
        citations: this.fetchCitationsForPage(db, page.id),
      })));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  queryPages(input: KnowledgeQueryInput): Promise<KnowledgePageWithCitations[]> {
    try {
      const db = this.ensureOpen();
      const limit = input.limit ?? 10;

      const clauses: string[] = [];
      const params: unknown[] = [];

      if (input.query) {
        const likePattern = `%${input.query}%`;
        clauses.push(
          '(title LIKE ? OR body LIKE ? OR domain LIKE ?)',
        );
        params.push(likePattern, likePattern, likePattern);
      }

      if (input.domain) {
        clauses.push("domain LIKE ?");
        params.push(`${input.domain}/%`);
      }

      if (input.excludeStatus) {
        clauses.push('status != ?');
        params.push(input.excludeStatus);
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      params.push(limit);

      const rows = db.prepare(
        `SELECT * FROM pages ${where} ORDER BY hit_count DESC, updated DESC, created DESC LIMIT ?`,
      ).all(...params) as KnowledgePage[];

      // Stamp last_accessed + increment hit_count in a single transaction for all hits.
      // This is the usage signal the Phase-4 expansion engine depends on.
      if (rows.length > 0) {
        const now = new Date().toISOString();
        const stamp = db.prepare(
          'UPDATE pages SET last_accessed = ?, hit_count = hit_count + 1 WHERE id = ?',
        );
        const tx = db.transaction((ids: number[]) => {
          for (const id of ids) stamp.run(now, id);
        });
        tx(rows.map((r) => r.id));
      }

      return Promise.resolve(rows.map((page) => ({
        ...page,
        citations: this.fetchCitationsForPage(db, page.id),
      })));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  addCitations(slug: string, citations: KnowledgeCitationInput[]): Promise<number> {
    try {
      const db = this.ensureOpen();

      const page = db.prepare(
        'SELECT id FROM pages WHERE slug = ?',
      ).get(slug) as { id: number } | undefined;

      if (!page) {
        throw new Error(`addCitations: page not found: ${slug}`);
      }

      const timestamp = new Date().toISOString();
      let added = 0;

      const insert = db.prepare(
        `INSERT INTO citations (page_id, claim, source_kind, source_locator, excerpt, retrieved_at, created)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );

      const tx = db.transaction(() => {
        for (const cit of citations) {
          enforceExcerptCap(cit.excerpt);
          insert.run(
            page.id,
            cit.claim,
            cit.source_kind,
            cit.source_locator ?? null,
            cit.excerpt,
            timestamp,
            timestamp,
          );
          added++;
        }
      });
      tx();

      return Promise.resolve(added);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ── Internals ──

  private ensureOpen(): Database {
    if (!this.db) {
      throw new Error('KnowledgeBackend is already closed');
    }
    return this.db;
  }

  private fetchCitationsForPage(db: Database, pageId: number): KnowledgeCitation[] {
    return db.prepare(
      'SELECT * FROM citations WHERE page_id = ? ORDER BY id',
    ).all(pageId) as KnowledgeCitation[];
  }

  private initSchema(): void {
    const statements = [
      `CREATE TABLE IF NOT EXISTS pages (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid          TEXT NOT NULL UNIQUE,
        slug          TEXT NOT NULL UNIQUE,
        title         TEXT NOT NULL,
        domain        TEXT NOT NULL,
        body          TEXT NOT NULL,
        sourcing      TEXT NOT NULL DEFAULT 'sourced',
        provenance    TEXT,
        status        TEXT NOT NULL DEFAULT 'active',
        created       TEXT NOT NULL,
        updated       TEXT,
        last_accessed TEXT,
        hit_count     INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain)`,
      `CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug)`,
      `CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status)`,
      `CREATE TABLE IF NOT EXISTS citations (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        claim          TEXT NOT NULL,
        source_kind    TEXT NOT NULL,
        source_locator TEXT,
        excerpt        TEXT NOT NULL,
        retrieved_at   TEXT NOT NULL,
        created        TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_citations_page ON citations(page_id)`,
    ];
    for (const sql of statements) {
      this.db!.prepare(sql).run();
    }
  }
}

// ── Helpers ──

function enforcePageBodyCap(body: string): void {
  if (body.length > MAX_PAGE_BODY_LENGTH) {
    throw new Error(
      `Page body exceeds hard cap of ${MAX_PAGE_BODY_LENGTH} characters ` +
      `(got ${body.length}). The knowledge backend enforces a size limit to bound memory and disk usage.`,
    );
  }
}

function enforceExcerptCap(excerpt: string): void {
  if (excerpt.length > MAX_CITATION_EXCERPT_LENGTH) {
    throw new Error(
      `Citation excerpt exceeds hard cap of ${MAX_CITATION_EXCERPT_LENGTH} characters ` +
      `(got ${excerpt.length}).`,
    );
  }
}
