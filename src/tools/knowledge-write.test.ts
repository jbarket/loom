import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { knowledgeWrite, titleToSlug, deriveSourced } from './knowledge-write.js';
import { SqliteKnowledgeBackend } from '../backends/sqlite-knowledge.js';

describe('titleToSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(titleToSlug('Hello World')).toBe('hello-world');
  });
  it('strips leading/trailing hyphens', () => {
    expect(titleToSlug(' Art E Fish ')).toBe('art-e-fish');
  });
  it('collapses multiple non-alphanumeric chars', () => {
    expect(titleToSlug('BGE-small-en-v1.5')).toBe('bge-small-en-v1-5');
  });
});

describe('deriveSourced (epistemic gate)', () => {
  it('returns sourced when no citations provided', () => {
    expect(deriveSourced({ title: 'T', domain: 'd', body: 'b' })).toBe('sourced');
  });

  it('returns sourced when citations include a web source', () => {
    expect(deriveSourced({
      title: 'T', domain: 'd', body: 'b',
      citations: [
        { claim: 'c', source_kind: 'web', excerpt: 'e' },
        { claim: 'c2', source_kind: 'conversation', excerpt: 'e2' },
      ],
    })).toBe('sourced');
  });

  it('returns sourced when citations include a loom_memory source', () => {
    expect(deriveSourced({
      title: 'T', domain: 'd', body: 'b',
      citations: [{ claim: 'c', source_kind: 'loom_memory', excerpt: 'e' }],
    })).toBe('sourced');
  });

  it('returns provisional when ALL citations are conversation', () => {
    expect(deriveSourced({
      title: 'T', domain: 'd', body: 'b',
      citations: [
        { claim: 'c1', source_kind: 'conversation', excerpt: 'e1' },
        { claim: 'c2', source_kind: 'conversation', excerpt: 'e2' },
      ],
    })).toBe('provisional');
  });

  it('respects caller sourcing=provisional when no citations', () => {
    expect(deriveSourced({
      title: 'T', domain: 'd', body: 'b',
      sourcing: 'provisional',
    })).toBe('provisional');
  });

  it('forces provisional even if caller requests sourced when all cits are conversation', () => {
    expect(deriveSourced({
      title: 'T', domain: 'd', body: 'b',
      sourcing: 'sourced',
      citations: [{ claim: 'c', source_kind: 'conversation', excerpt: 'e' }],
    })).toBe('provisional');
  });
});

describe('knowledgeWrite tool', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'loom-kw-tool-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a page and returns a success message', async () => {
    const out = await knowledgeWrite(tmpDir, {
      title: 'Buchla 200 Series',
      domain: 'music/eurorack',
      body: 'A modular synthesizer series by Don Buchla.',
      citations: [
        {
          claim: 'Buchla introduced the 200 series in the 1970s',
          source_kind: 'web',
          source_locator: 'https://example.com/buchla',
          excerpt: 'Don Buchla released the 200 series modular system in 1970.',
        },
      ],
    });
    expect(out).toContain('Buchla 200 Series');
    expect(out).toContain('buchla-200-series');
    expect(out).toContain('1 citation(s) added');
    expect(out).not.toContain('provisional');
  });

  it('stores page as provisional when all citations are conversation', async () => {
    const out = await knowledgeWrite(tmpDir, {
      title: 'Jonathan loves the Strega',
      domain: 'music',
      body: 'Jonathan has mentioned loving the Strega multiple times.',
      citations: [
        {
          claim: 'Jonathan said he loves the Strega',
          source_kind: 'conversation',
          excerpt: 'I love the Strega',
        },
      ],
    });
    expect(out).toContain('provisional');
  });

  it('derives slug from title when slug not provided', async () => {
    const out = await knowledgeWrite(tmpDir, {
      title: 'LPG Self Oscillation',
      domain: 'music/synthesis',
      body: 'Low-pass gates can self-oscillate.',
      citations: [{ claim: 'c', source_kind: 'web', excerpt: 'e' }],
    });
    expect(out).toContain('lpg-self-oscillation');
  });

  it('uses provided slug over derived slug', async () => {
    const out = await knowledgeWrite(tmpDir, {
      slug: 'custom-slug',
      title: 'My Entity',
      domain: 'test',
      body: 'Body.',
      citations: [{ claim: 'c', source_kind: 'web', excerpt: 'e' }],
    });
    expect(out).toContain('custom-slug');
  });

  it('upserts an existing page', async () => {
    await knowledgeWrite(tmpDir, {
      slug: 'upsert-me',
      title: 'Original',
      domain: 'test',
      body: 'First body.',
      citations: [{ claim: 'c', source_kind: 'web', excerpt: 'e' }],
    });
    const out = await knowledgeWrite(tmpDir, {
      slug: 'upsert-me',
      title: 'Changed (ignored on upsert)',
      domain: 'test',
      body: 'Updated body.',
      citations: [{ claim: 'c2', source_kind: 'web', excerpt: 'e2' }],
    });
    expect(out).toContain('upsert-me');

    // Verify the body was actually updated
    const backend = new SqliteKnowledgeBackend({ dbPath: join(tmpDir, 'knowledge.db') });
    try {
      const page = await backend.getPage('upsert-me');
      expect(page!.body).toBe('Updated body.');
      expect(page!.title).toBe('Original'); // title preserved on upsert
    } finally {
      backend.close();
    }
  });

  it('closes the backend even when write throws', async () => {
    const oversizedBody = 'x'.repeat(64 * 1024 + 1);
    await expect(
      knowledgeWrite(tmpDir, {
        title: 'Too Big',
        domain: 'test',
        body: oversizedBody,
      }),
    ).rejects.toThrow(/exceeds hard cap/);
    // No fd leak — backend was closed in finally. Writing a new page must succeed.
    const out = await knowledgeWrite(tmpDir, {
      title: 'After Error',
      domain: 'test',
      body: 'Small page.',
    });
    expect(out).toContain('After Error');
  });
});
