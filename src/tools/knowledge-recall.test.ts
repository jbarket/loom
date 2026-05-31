import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { knowledgeRecall } from './knowledge-recall.js';
import { knowledgeWrite } from './knowledge-write.js';
import { createKnowledgeBackend } from '../backends/index.js';

describe('knowledgeRecall', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'loom-kr-'));
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function seedPage(slug: string, domain: string, title: string, body: string) {
    await knowledgeWrite(tempDir, {
      slug,
      domain,
      title,
      body,
      citations: [
        {
          claim: `${title} fact`,
          source_kind: 'web',
          source_locator: `https://example.com/${slug}`,
          excerpt: body.slice(0, 100),
        },
      ],
    });
  }

  it('returns a no-results message when store is empty', async () => {
    const result = await knowledgeRecall(tempDir, { query: 'anything' });
    expect(result).toMatch(/No knowledge pages found/);
  });

  it('finds pages matching query in body', async () => {
    await seedPage('rings', 'music/eurorack', 'Rings', 'Physical modelling resonator for eurorack.');
    await seedPage('plaits', 'music/eurorack', 'Plaits', 'Macro-oscillator with 16 synthesis engines.');

    const result = await knowledgeRecall(tempDir, { query: 'resonator' });
    expect(result).toMatch(/Rings/);
    expect(result).not.toMatch(/Plaits/);
  });

  it('finds pages matching query in title', async () => {
    await seedPage('rings', 'music/eurorack', 'Rings Resonator Module', 'Details about the module.');
    await seedPage('plaits', 'music/eurorack', 'Plaits Macro-Oscillator', 'Details about oscillation.');

    const result = await knowledgeRecall(tempDir, { query: 'Rings' });
    expect(result).toMatch(/Rings/);
    expect(result).not.toMatch(/Plaits/);
  });

  it('increments hit_count and stamps last_accessed on recall (tested AC)', async () => {
    await seedPage('rings', 'music/eurorack', 'Rings', 'Physical modelling resonator.');

    const backend = createKnowledgeBackend(tempDir);
    try {
      const before = await backend.getPage('rings');
      expect(before!.hit_count).toBe(0);
      expect(before!.last_accessed).toBeNull();
    } finally {
      backend.close();
    }

    await knowledgeRecall(tempDir, { query: 'resonator' });

    const backend2 = createKnowledgeBackend(tempDir);
    try {
      const after = await backend2.getPage('rings');
      expect(after!.hit_count).toBe(1);
      expect(after!.last_accessed).not.toBeNull();
    } finally {
      backend2.close();
    }
  });

  it('increments hit_count in a transaction — multiple recalls accumulate correctly', async () => {
    await seedPage('rings', 'music/eurorack', 'Rings', 'Physical modelling resonator.');

    await knowledgeRecall(tempDir, { query: 'resonator' });
    await knowledgeRecall(tempDir, { query: 'modelling' });

    const backend = createKnowledgeBackend(tempDir);
    try {
      const page = await backend.getPage('rings');
      expect(page!.hit_count).toBe(2);
    } finally {
      backend.close();
    }
  });

  it('does not surface archived pages', async () => {
    await seedPage('archived-page', 'test', 'Archived', 'This is archived.');

    // Manually archive it
    const backend = createKnowledgeBackend(tempDir);
    try {
      const db = (backend as unknown as { ensureOpen(): unknown })['ensureOpen']() as {
        prepare(sql: string): { run(...args: unknown[]): unknown };
      };
      db.prepare("UPDATE pages SET status = 'archived' WHERE slug = ?").run('archived-page');
    } finally {
      backend.close();
    }

    const result = await knowledgeRecall(tempDir, { query: 'archived' });
    expect(result).toMatch(/No knowledge pages found/);
  });

  it('filters by domain prefix', async () => {
    await seedPage('rings', 'music/eurorack', 'Rings', 'Resonator.');
    await seedPage('python-basics', 'programming/python', 'Python', 'A language.');

    const result = await knowledgeRecall(tempDir, { domain: 'music' });
    expect(result).toMatch(/Rings/);
    expect(result).not.toMatch(/Python/);
  });

  it('returns all pages when no query given (browsing)', async () => {
    await seedPage('page-a', 'test', 'Alpha', 'First page.');
    await seedPage('page-b', 'test', 'Beta', 'Second page.');

    const result = await knowledgeRecall(tempDir, {});
    expect(result).toMatch(/Alpha/);
    expect(result).toMatch(/Beta/);
  });
});
