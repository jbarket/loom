import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { knowledgeRecall, formatKnowledgePage } from './knowledge-recall.js';
import { SqliteKnowledgeBackend } from '../backends/sqlite-knowledge.js';

describe('knowledgeRecall tool', () => {
  let tmpDir: string;
  let backend: SqliteKnowledgeBackend;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'loom-kr-tool-'));
    backend = new SqliteKnowledgeBackend({ dbPath: join(tmpDir, 'knowledge.db') });
  });

  afterEach(() => {
    backend.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function seedPage(slug: string, title: string, domain: string, body: string): Promise<void> {
    await backend.writePage({ slug, title, domain, body });
  }

  it('returns no-match message when nothing found', async () => {
    const out = await knowledgeRecall(tmpDir, { query: 'nonexistent' });
    expect(out).toContain('No knowledge pages found');
    expect(out).toContain('"nonexistent"');
  });

  it('finds a page by body content', async () => {
    await seedPage('strega', 'The Strega', 'music/eurorack', 'LPG with self-oscillation and spring reverb.');
    const out = await knowledgeRecall(tmpDir, { query: 'spring reverb' });
    expect(out).toContain('The Strega');
    expect(out).toContain('LPG with self-oscillation');
  });

  it('finds a page by title', async () => {
    await seedPage('buchla-200', 'Buchla 200 Series', 'music/eurorack', 'Classic modular system.');
    const out = await knowledgeRecall(tmpDir, { query: 'Buchla' });
    expect(out).toContain('Buchla 200 Series');
  });

  it('filters by domain prefix', async () => {
    await seedPage('strega', 'The Strega', 'music/eurorack', 'Content');
    await seedPage('wavefolder', 'Wavefolder', 'music/synthesis', 'Content');
    await seedPage('loom-tool', 'Loom', 'project', 'Content');

    const out = await knowledgeRecall(tmpDir, { query: 'Content', domain: 'music' });
    expect(out).toContain('The Strega');
    expect(out).toContain('Wavefolder');
    expect(out).not.toContain('Loom');
  });

  it('matches flat domain exactly (not just subdomains)', async () => {
    await seedPage('flat-domain', 'Flat Domain Page', 'music', 'Content about music.');
    const out = await knowledgeRecall(tmpDir, { query: 'music', domain: 'music' });
    expect(out).toContain('Flat Domain Page');
  });

  it('increments hit_count on recall — AC: usage touch in transaction', async () => {
    await seedPage('hit-test', 'Hit Test', 'test', 'Body for hit tracking.');

    // Hit it twice
    await knowledgeRecall(tmpDir, { query: 'hit tracking' });
    await knowledgeRecall(tmpDir, { query: 'hit tracking' });

    const page = await backend.getPage('hit-test');
    expect(page!.hit_count).toBe(2);
  });

  it('updates last_accessed on recall — AC: usage touch in transaction', async () => {
    await seedPage('access-test', 'Access Test', 'test', 'Access tracking body.');

    const before = new Date().toISOString();
    await knowledgeRecall(tmpDir, { query: 'access tracking' });

    const page = await backend.getPage('access-test');
    expect(page!.last_accessed).not.toBeNull();
    // ISO strings sort lexicographically, so >= works as a timestamp comparison
    expect(page!.last_accessed! >= before).toBe(true);
  });

  it('does not surface archived pages', async () => {
    await seedPage('archived-page', 'Archived Page', 'test', 'Should not appear.');
    const db = backend['ensureOpen']();
    db.prepare("UPDATE pages SET status = 'archived' WHERE slug = ?").run('archived-page');

    const out = await knowledgeRecall(tmpDir, { query: 'Should not appear' });
    expect(out).not.toContain('Archived Page');
  });

  it('shows citation details in output', async () => {
    await backend.writePage({
      slug: 'cited-page',
      title: 'Cited Page',
      domain: 'test',
      body: 'A cited body.',
      citations: [
        {
          claim: 'A verifiable claim',
          source_kind: 'web',
          source_locator: 'https://example.com',
          excerpt: 'Supporting quote from the source.',
        },
      ],
    });

    const out = await knowledgeRecall(tmpDir, { query: 'cited body' });
    expect(out).toContain('A verifiable claim');
    expect(out).toContain('https://example.com');
    expect(out).toContain('Supporting quote');
  });

  it('closes the backend even when query throws', async () => {
    // Close the shared backend so we can test error recovery
    backend.close();
    // Write a corrupt knowledge.db to force an open failure
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(tmpDir, 'knowledge.db'), 'NOT A DB');

    await expect(
      knowledgeRecall(tmpDir, { query: 'test' }),
    ).rejects.toThrow();
  });
});

describe('formatKnowledgePage', () => {
  it('renders title, domain, sourcing, body, and citations', () => {
    const out = formatKnowledgePage({
      id: 1, uuid: 'u', slug: 'test-page', title: 'Test Page',
      domain: 'music', body: 'Test body content.',
      sourcing: 'sourced', provenance: null, status: 'active',
      created: '2026-01-01T00:00:00Z', updated: null, last_accessed: null, hit_count: 0,
      citations: [
        {
          id: 1, page_id: 1, claim: 'A claim', source_kind: 'web',
          source_locator: 'https://example.com', excerpt: 'An excerpt.',
          retrieved_at: '2026-01-01T00:00:00Z', created: '2026-01-01T00:00:00Z',
        },
      ],
    });
    expect(out).toContain('## Test Page');
    expect(out).toContain('music');
    expect(out).toContain('sourced');
    expect(out).toContain('Test body content.');
    expect(out).toContain('A claim');
    expect(out).toContain('https://example.com');
    expect(out).toContain('An excerpt.');
  });

  it('renders provisional sourcing note', () => {
    const out = formatKnowledgePage({
      id: 1, uuid: 'u', slug: 'prov', title: 'Provisional Page',
      domain: 'test', body: 'Body.', sourcing: 'provisional',
      provenance: 'imported from eurorack@abc123', status: 'active',
      created: '2026-01-01T00:00:00Z', updated: null, last_accessed: null, hit_count: 0,
      citations: [],
    });
    expect(out).toContain('provisional');
    expect(out).toContain('imported from eurorack@abc123');
  });
});
