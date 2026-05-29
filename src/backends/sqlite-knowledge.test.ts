import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteKnowledgeBackend } from './sqlite-knowledge.js';
import { resolveKnowledgeDbPath, assertKnowledgePathsNotCoLocated } from '../config.js';

describe('SqliteKnowledgeBackend', () => {
  let tmpDir: string;
  let backend: SqliteKnowledgeBackend;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'loom-know-'));
    backend = new SqliteKnowledgeBackend({
      dbPath: join(tmpDir, 'knowledge.db'),
    });
  });

  afterEach(() => {
    backend.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes schema and stamps user_version = 1', () => {
    const db = backend['ensureOpen']();
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(1);

    // Verify tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain('pages');
    expect(tables.map((t) => t.name)).toContain('citations');
  });

  it('uses WAL mode', () => {
    const db = backend['ensureOpen']();
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');
  });

  it('writes and retrieves a page', async () => {
    const result = await backend.writePage({
      slug: 'art-agent',
      title: 'Art E Fish',
      domain: 'identity',
      body: 'Persistent agent identity system for AI agents.',
      sourcing: 'sourced',
    });

    expect(result.uuid).toBeDefined();
    expect(result.slug).toBe('art-agent');
    expect(result.title).toBe('Art E Fish');
    expect(result.citationsAdded).toBe(0);

    const page = await backend.getPage('art-agent');
    expect(page).not.toBeNull();
    expect(page!.title).toBe('Art E Fish');
    expect(page!.body).toBe('Persistent agent identity system for AI agents.');
    expect(page!.sourcing).toBe('sourced');
    expect(page!.citations).toEqual([]);
  });

  it('writes a page with citations', async () => {
    const result = await backend.writePage({
      slug: 'loom-project',
      title: 'Loom Project',
      domain: 'project',
      body: 'Memory subsystem for AI agents.',
      citations: [
        {
          claim: 'Loom uses sqlite-vec',
          source_kind: 'loom_memory',
          source_locator: 'project/loom-architecture',
          excerpt: 'Vector search via sqlite-vec FTS index',
        },
      ],
    });

    expect(result.citationsAdded).toBe(1);

    const page = await backend.getPage('loom-project');
    expect(page!.citations).toHaveLength(1);
    expect(page!.citations[0].claim).toBe('Loom uses sqlite-vec');
    expect(page!.citations[0].source_kind).toBe('loom_memory');
  });

  it('upserts an existing page by slug', async () => {
    await backend.writePage({
      slug: 'test-page',
      title: 'Original Title',
      domain: 'test',
      body: 'Original body',
    });

    const original = await backend.getPage('test-page');
    const originalUuid = original!.uuid;

    const result = await backend.writePage({
      slug: 'test-page',
      title: 'Changed Title',
      domain: 'test',
      body: 'Updated body content',
    });

    expect(result.uuid).toBe(originalUuid);
    expect(result.title).toBe('Original Title'); // preserved

    const updated = await backend.getPage('test-page');
    expect(updated!.body).toBe('Updated body content');
    expect(updated!.title).toBe('Original Title');
    expect(updated!.sourcing).toBe('sourced'); // preserved
  });

  it('returns null for unknown slug', async () => {
    const page = await backend.getPage('nonexistent');
    expect(page).toBeNull();
  });

  it('lists pages with ordering', async () => {
    await backend.writePage({
      slug: 'alpha',
      title: 'Alpha',
      domain: 'test',
      body: 'First page',
    });
    await backend.writePage({
      slug: 'beta',
      title: 'Beta',
      domain: 'test',
      body: 'Second page',
    });

    const pages = await backend.listPages({});
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.slug)).toContain('alpha');
    expect(pages.map((p) => p.slug)).toContain('beta');
  });

  it('filters listPages by domain', async () => {
    await backend.writePage({
      slug: 'page-a',
      title: 'A',
      domain: 'identity/something',
      body: 'Identity page',
    });
    await backend.writePage({
      slug: 'page-b',
      title: 'B',
      domain: 'project/loom',
      body: 'Project page',
    });

    const identity = await backend.listPages({ domain: 'identity' });
    expect(identity).toHaveLength(1);
    expect(identity[0].slug).toBe('page-a');

    const project = await backend.listPages({ domain: 'project' });
    expect(project).toHaveLength(1);
    expect(project[0].slug).toBe('page-b');
  });

  it('filters listPages by excludeStatus', async () => {
    await backend.writePage({
      slug: 'active-page',
      title: 'Active',
      domain: 'test',
      body: 'Active content',
    });

    // Manually set one page to archived status
    const db = backend['ensureOpen']();
    db.prepare("UPDATE pages SET status = 'archived' WHERE slug = ?").run('active-page');

    const active = await backend.listPages({ excludeStatus: 'archived' });
    expect(active).toHaveLength(0);

    const all = await backend.listPages({});
    expect(all).toHaveLength(1);
  });

  it('limits listPages results', async () => {
    for (let i = 0; i < 5; i++) {
      await backend.writePage({
        slug: `page-${i}`,
        title: `Page ${i}`,
        domain: 'test',
        body: `Body ${i}`,
      });
    }

    const pages = await backend.listPages({ limit: 2 });
    expect(pages).toHaveLength(2);
  });

  it('searches pages by query (LIKE)', async () => {
    await backend.writePage({
      slug: 'page-loom',
      title: 'Loom Architecture',
      domain: 'project',
      body: 'Loom uses sqlite-vec for vector search.',
    });
    await backend.writePage({
      slug: 'page-unrelated',
      title: 'Weather Report',
      domain: 'random',
      body: 'Temperature is 72 degrees.',
    });

    const results = await backend.queryPages({ query: 'sqlite-vec' });
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('page-loom');
  });

  it('searches across title, body, and domain', async () => {
    await backend.writePage({
      slug: 'page-title-match',
      title: 'Loom Knowledge System',
      domain: 'project',
      body: 'Some generic content',
    });
    await backend.writePage({
      slug: 'page-body-match',
      title: 'Generic Title',
      domain: 'project',
      body: 'Contains loom reference',
    });

    const results = await backend.queryPages({ query: 'loom' });
    expect(results).toHaveLength(2);
  });

  it('searches with domain filter', async () => {
    await backend.writePage({
      slug: 'page-identity',
      title: 'Art Agent',
      domain: 'identity/art',
      body: 'Loom integration',
    });
    await backend.writePage({
      slug: 'page-project',
      title: 'Loom Project',
      domain: 'project/loom',
      body: 'Loom integration',
    });

    const results = await backend.queryPages({ query: 'loom', domain: 'identity' });
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('page-identity');
  });

  it('adds citations to existing page', async () => {
    await backend.writePage({
      slug: 'citation-test',
      title: 'Citation Test',
      domain: 'test',
      body: 'Page with citations',
    });

    const added = await backend.addCitations('citation-test', [
      {
        claim: 'First claim',
        source_kind: 'web',
        source_locator: 'https://example.com/page1',
        excerpt: 'Excerpt one',
      },
      {
        claim: 'Second claim',
        source_kind: 'conversation',
        excerpt: 'Excerpt two',
      },
    ]);

    expect(added).toBe(2);

    const page = await backend.getPage('citation-test');
    expect(page!.citations).toHaveLength(2);
  });

  it('throws when adding citations to nonexistent page', async () => {
    await expect(
      backend.addCitations('does-not-exist', [
        {
          claim: 'Claim',
          source_kind: 'web',
          excerpt: 'Excerpt',
        },
      ]),
    ).rejects.toThrow(/page not found/);
  });

  it('enforces page body hard cap', async () => {
    const largeBody = 'x'.repeat(64 * 1024 + 1);
    await expect(
      backend.writePage({
        slug: 'oversized',
        title: 'Oversized',
        domain: 'test',
        body: largeBody,
      }),
    ).rejects.toThrow(/exceeds hard cap/);
  });

  it('enforces citation excerpt hard cap', async () => {
    await backend.writePage({
      slug: 'cap-test',
      title: 'Cap Test',
      domain: 'test',
      body: 'Normal body',
    });

    const largeExcerpt = 'e'.repeat(4097);
    await expect(
      backend.addCitations('cap-test', [
        {
          claim: 'Claim',
          source_kind: 'web',
          excerpt: largeExcerpt,
        },
      ]),
    ).rejects.toThrow(/exceeds hard cap/);
  });

  it('allows page body at exactly the cap', async () => {
    const exactBody = 'x'.repeat(64 * 1024);
    await expect(
      backend.writePage({
        slug: 'exact-cap',
        title: 'Exact',
        domain: 'test',
        body: exactBody,
      }),
    ).resolves.toBeDefined();
  });

  it('errors after close', async () => {
    await backend.writePage({
      slug: 'before-close',
      title: 'Before',
      domain: 'test',
      body: 'Content',
    });

    backend.close();

    await expect(backend.getPage('before-close')).rejects.toThrow(
      /already closed/,
    );
  });

  it('resolves knowledge db path correctly', () => {
    const path = resolveKnowledgeDbPath(tmpDir);
    expect(path).toBe(join(tmpDir, 'knowledge.db'));
  });

  it('allows overriding knowledge db path via env', () => {
    const original = process.env.LOOM_KNOWLEDGE_DB_PATH;
    process.env.LOOM_KNOWLEDGE_DB_PATH = '/tmp/custom-knowledge.db';
    try {
      const path = resolveKnowledgeDbPath(tmpDir);
      expect(path).toBe('/tmp/custom-knowledge.db');
    } finally {
      process.env.LOOM_KNOWLEDGE_DB_PATH = original;
    }
  });

  it('co-location guard rejects same path', () => {
    const originalMem = process.env.LOOM_SQLITE_DB_PATH;
    const originalKn = process.env.LOOM_KNOWLEDGE_DB_PATH;
    try {
      process.env.LOOM_SQLITE_DB_PATH = '/tmp/same.db';
      process.env.LOOM_KNOWLEDGE_DB_PATH = '/tmp/same.db';
      expect(() => assertKnowledgePathsNotCoLocated(tmpDir)).toThrow(
        /same as memory database path/,
      );
    } finally {
      process.env.LOOM_SQLITE_DB_PATH = originalMem;
      process.env.LOOM_KNOWLEDGE_DB_PATH = originalKn;
    }
  });

  it('co-location guard rejects same inode', () => {
    const originalMem = process.env.LOOM_SQLITE_DB_PATH;
    const originalKn = process.env.LOOM_KNOWLEDGE_DB_PATH;
    try {
      const memPath = join(tmpDir, 'memories.db');
      const knPath = join(tmpDir, 'knowledge-link.db');
      // Create a real file at memPath, then hard-link knPath to it
      writeFileSync(memPath, 'dummy');
      linkSync(memPath, knPath);

      process.env.LOOM_SQLITE_DB_PATH = memPath;
      process.env.LOOM_KNOWLEDGE_DB_PATH = knPath;

      expect(() => assertKnowledgePathsNotCoLocated(tmpDir)).toThrow(
        /hard-linked/,
      );
    } finally {
      process.env.LOOM_SQLITE_DB_PATH = originalMem;
      process.env.LOOM_KNOWLEDGE_DB_PATH = originalKn;
    }
  });

  it('co-location guard allows separate files', () => {
    const originalMem = process.env.LOOM_SQLITE_DB_PATH;
    const originalKn = process.env.LOOM_KNOWLEDGE_DB_PATH;
    try {
      const memPath = join(tmpDir, 'memories.db');
      const knPath = join(tmpDir, 'knowledge.db');
      writeFileSync(memPath, 'memory');
      writeFileSync(knPath, 'knowledge');

      process.env.LOOM_SQLITE_DB_PATH = memPath;
      process.env.LOOM_KNOWLEDGE_DB_PATH = knPath;

      expect(() => assertKnowledgePathsNotCoLocated(tmpDir)).not.toThrow();
    } finally {
      process.env.LOOM_SQLITE_DB_PATH = originalMem;
      process.env.LOOM_KNOWLEDGE_DB_PATH = originalKn;
    }
  });

  it('co-location guard allows non-existent files', () => {
    const originalMem = process.env.LOOM_SQLITE_DB_PATH;
    const originalKn = process.env.LOOM_KNOWLEDGE_DB_PATH;
    try {
      process.env.LOOM_SQLITE_DB_PATH = join(tmpDir, 'future-mem.db');
      process.env.LOOM_KNOWLEDGE_DB_PATH = join(tmpDir, 'future-kn.db');

      expect(() => assertKnowledgePathsNotCoLocated(tmpDir)).not.toThrow();
    } finally {
      process.env.LOOM_SQLITE_DB_PATH = originalMem;
      process.env.LOOM_KNOWLEDGE_DB_PATH = originalKn;
    }
  });

  it('citations are cascaded on page delete', () => {
    // Write page with citations, then delete page row directly and verify citations gone
    backend.writePage({
      slug: 'cascade-test',
      title: 'Cascade',
      domain: 'test',
      body: 'Body',
      citations: [
        {
          claim: 'Claim',
          source_kind: 'web',
          excerpt: 'Excerpt',
        },
      ],
    });

    const db = backend['ensureOpen']();
    const page = db
      .prepare('SELECT id FROM pages WHERE slug = ?')
      .get('cascade-test') as { id: number };

    db.prepare('DELETE FROM pages WHERE id = ?').run(page.id);

    const citations = db
      .prepare('SELECT COUNT(*) as count FROM citations')
      .get() as { count: number };
    expect(citations.count).toBe(0);
  });
});
