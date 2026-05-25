import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteVecBackend } from './sqlite-vec.js';
import type { EmbeddingProvider } from './types.js';

/**
 * Deterministic "embedder" for tests: maps each input to a unit vector
 * in a fixed 4-dim space by keyword presence. Avoids loading a real
 * ONNX model while still exercising cosine-distance ranking.
 */
function makeKeywordEmbedder(): EmbeddingProvider {
  const axes = ['loom', 'earworm', 'samplebank', 'hermes'];

  const encode = (text: string): number[] => {
    const lower = text.toLowerCase();
    const vec = axes.map((axis) => (lower.includes(axis) ? 1 : 0));
    // Always nonzero so sqlite-vec doesn't choke on a zero vector
    if (vec.every((v) => v === 0)) vec[0] = 0.01;
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return vec.map((v) => v / norm);
  };

  return {
    dimensions: 4,
    embed: vi.fn(async (t: string) => encode(t)),
    embedBatch: vi.fn(async (ts: string[]) => ts.map(encode)),
  };
}

describe('SqliteVecBackend', () => {
  let tmpDir: string;
  let backend: SqliteVecBackend;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'loom-sqlite-vec-'));
    backend = new SqliteVecBackend(
      { dbPath: join(tmpDir, 'test.db') },
      makeKeywordEmbedder(),
    );
  });

  afterEach(() => {
    backend.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('remembers and recalls a memory', async () => {
    const ref = await backend.remember({
      category: 'project',
      title: 'Loom rescue plan',
      content: 'Migrate from Qdrant to sqlite-vec',
    });
    expect(ref.ref).toMatch(/^project\/loom-rescue-plan-/);
    expect(ref.category).toBe('project');

    const results = await backend.recall({ query: 'loom rescue' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Loom rescue plan');
    expect(results[0].relevance).toBeGreaterThan(0);
  });

  it('ranks by semantic similarity', async () => {
    await backend.remember({
      category: 'project',
      title: 'Earworm release',
      content: 'earworm phase 5 shipped',
    });
    await backend.remember({
      category: 'project',
      title: 'Loom migration',
      content: 'loom to sqlite',
    });

    const results = await backend.recall({ query: 'loom', limit: 5 });
    expect(results[0].title).toBe('Loom migration');
  });

  it('filters by category', async () => {
    await backend.remember({
      category: 'project',
      title: 'Loom A',
      content: 'loom work',
    });
    await backend.remember({
      category: 'reference',
      title: 'Loom B',
      content: 'loom docs',
    });

    const proj = await backend.recall({ query: 'loom', category: 'project' });
    expect(proj).toHaveLength(1);
    expect(proj[0].category).toBe('project');

    const ref = await backend.recall({ query: 'loom', category: 'reference' });
    expect(ref).toHaveLength(1);
    expect(ref[0].category).toBe('reference');
  });

  it('filters by project', async () => {
    await backend.remember({
      category: 'project',
      title: 'Loom on earworm-proj',
      content: 'loom integration',
      project: 'earworm',
    });
    await backend.remember({
      category: 'project',
      title: 'Loom on samplebank-proj',
      content: 'loom support',
      project: 'samplebank',
    });

    const earworm = await backend.recall({ query: 'loom', project: 'earworm' });
    expect(earworm).toHaveLength(1);
    expect(earworm[0].project).toBe('earworm');
  });

  it('forgets by ref', async () => {
    const { ref } = await backend.remember({
      category: 'project',
      title: 'Hermes import',
      content: 'hermes work',
    });
    const result = await backend.forget({ ref });
    expect(result.deleted).toEqual([ref]);

    const after = await backend.recall({ query: 'hermes' });
    expect(after).toHaveLength(0);
  });

  it('forgets bulk by project', async () => {
    await backend.remember({
      category: 'project',
      title: 'A',
      content: 'loom a',
      project: 'earworm',
    });
    await backend.remember({
      category: 'project',
      title: 'B',
      content: 'loom b',
      project: 'earworm',
    });
    await backend.remember({
      category: 'project',
      title: 'C',
      content: 'loom c',
      project: 'samplebank',
    });

    const result = await backend.forget({ project: 'earworm' });
    expect(result.deleted).toHaveLength(2);

    const remaining = await backend.recall({ query: 'loom' });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].project).toBe('samplebank');
  });

  it('updates content and re-embeds', async () => {
    const { ref } = await backend.remember({
      category: 'project',
      title: 'Migration',
      content: 'hermes import',
    });
    const result = await backend.update({
      ref,
      content: 'loom migration complete',
    });
    expect(result.updated).toBe(true);

    const hits = await backend.recall({ query: 'loom', limit: 5 });
    expect(hits[0].content).toBe('loom migration complete');
  });

  it('preserves metadata through update', async () => {
    const { ref } = await backend.remember({
      category: 'project',
      title: 'Meta test',
      content: 'loom',
      metadata: { tier: 1 },
    });
    await backend.update({ ref, metadata: { tier: 2, extra: 'x' } });

    // Read raw row to inspect stored metadata
    const db = backend.getDatabase();
    const row = db
      .prepare('SELECT metadata FROM memories WHERE ref = ?')
      .get(ref) as { metadata: string };
    const meta = JSON.parse(row.metadata);
    expect(meta).toEqual({ tier: 2, extra: 'x' });
  });

  it('lists memories', async () => {
    await backend.remember({
      category: 'project',
      title: 'A',
      content: 'loom',
    });
    await backend.remember({
      category: 'reference',
      title: 'B',
      content: 'loom',
    });

    const all = await backend.list({});
    expect(all).toHaveLength(2);

    const projects = await backend.list({ category: 'project' });
    expect(projects).toHaveLength(1);
    expect(projects[0].category).toBe('project');
  });

  it('prunes expired memories', async () => {
    // Memory with past expires_at
    await backend.remember({
      category: 'reference',
      title: 'Stale',
      content: 'loom',
      ttl: '1h',
    });
    // Manually set expires_at to the past
    const db = backend.getDatabase();
    db.prepare(
      "UPDATE memories SET expires_at = '2020-01-01T00:00:00.000Z' WHERE title = 'Stale'",
    ).run();

    await backend.remember({
      category: 'reference',
      title: 'Fresh',
      content: 'loom',
      ttl: 'permanent',
    });

    const result = await backend.prune();
    expect(result.expired).toHaveLength(1);

    const remaining = await backend.recall({ query: 'loom' });
    expect(remaining.map((r) => r.title)).toEqual(['Fresh']);
  });

  it('stamps last_accessed on recall', async () => {
    const { ref } = await backend.remember({
      category: 'project',
      title: 'Stamp',
      content: 'loom',
    });

    const db = backend.getDatabase();
    const before = (
      db.prepare('SELECT last_accessed FROM memories WHERE ref = ?').get(ref) as {
        last_accessed: string | null;
      }
    ).last_accessed;
    expect(before).toBeNull();

    await backend.recall({ query: 'loom' });

    const after = (
      db.prepare('SELECT last_accessed FROM memories WHERE ref = ?').get(ref) as {
        last_accessed: string | null;
      }
    ).last_accessed;
    expect(after).not.toBeNull();
  });

  describe('findSimilar', () => {
    it('returns neighbours of a given ref, excluding the ref itself', async () => {
      const { ref: anchor } = await backend.remember({
        category: 'project',
        title: 'Loom rescue',
        content: 'loom migration plan',
      });
      await backend.remember({
        category: 'project',
        title: 'Loom adapter',
        content: 'loom integration',
      });
      await backend.remember({
        category: 'project',
        title: 'Earworm phase 5',
        content: 'earworm shipped',
      });

      const results = await backend.findSimilar({ ref: anchor, limit: 5 });

      expect(results.map((r) => r.title)).not.toContain('Loom rescue');
      expect(results[0].title).toBe('Loom adapter');
    });

    it('returns neighbours of free-form text when no ref is given', async () => {
      await backend.remember({ category: 'project', title: 'A', content: 'loom' });
      await backend.remember({ category: 'project', title: 'B', content: 'earworm' });

      const results = await backend.findSimilar({ text: 'loom work', limit: 5 });
      expect(results[0].title).toBe('A');
    });

    it('honours category + project + minRelevance filters', async () => {
      const { ref: anchor } = await backend.remember({
        category: 'project',
        title: 'Loom anchor',
        content: 'loom',
        project: 'loom',
      });
      await backend.remember({
        category: 'project',
        title: 'Loom sibling',
        content: 'loom',
        project: 'loom',
      });
      await backend.remember({
        category: 'reference',
        title: 'Loom ref',
        content: 'loom',
      });

      const scoped = await backend.findSimilar({
        ref: anchor,
        category: 'project',
        project: 'loom',
        minRelevance: 0.5,
      });
      expect(scoped).toHaveLength(1);
      expect(scoped[0].title).toBe('Loom sibling');
      expect(scoped[0].relevance).toBeGreaterThanOrEqual(0.5);
    });

    it('throws when neither ref nor text is supplied', async () => {
      await expect(backend.findSimilar({})).rejects.toThrow(/ref or text/i);
    });

    it('throws when ref is supplied but the memory is missing', async () => {
      await expect(
        backend.findSimilar({ ref: 'project/does-not-exist' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('audit', () => {
    it('reports counts, category breakdown, stale, duplicates, and expired', async () => {
      const { ref: anchorRef } = await backend.remember({
        category: 'project',
        title: 'Loom anchor',
        content: 'loom work',
      });
      await backend.remember({
        category: 'project',
        title: 'Loom duplicate',
        content: 'loom work',
      });
      await backend.remember({
        category: 'reference',
        title: 'Solo',
        content: 'earworm',
      });
      await backend.remember({
        category: 'reference',
        title: 'Expired',
        content: 'samplebank',
        ttl: '1h',
      });

      const db = backend.getDatabase();
      // Force one memory to be both stale (old last_accessed) and another expired.
      db.prepare(
        "UPDATE memories SET last_accessed = '2020-01-01T00:00:00.000Z' WHERE ref = ?",
      ).run(anchorRef);
      db.prepare(
        "UPDATE memories SET expires_at = '2020-01-01T00:00:00.000Z' WHERE title = 'Expired'",
      ).run();

      const report = await backend.audit({
        staleDays: 30,
        similarityThreshold: 0.8,
      });

      expect(report.totalMemories).toBe(4);
      expect(report.byCategory).toEqual({ project: 2, reference: 2 });
      expect(report.stale.map((s) => s.title)).toContain('Loom anchor');
      expect(report.expired).toHaveLength(1);
      const dupTitles = report.duplicates.flatMap((p) => [p.a.title, p.b.title]);
      expect(dupTitles).toContain('Loom anchor');
      expect(dupTitles).toContain('Loom duplicate');
    });

    it('excludes TTL=permanent memories from the stale list', async () => {
      const { ref } = await backend.remember({
        category: 'reference',
        title: 'Forever',
        content: 'loom',
        ttl: 'permanent',
      });
      const db = backend.getDatabase();
      db.prepare(
        "UPDATE memories SET last_accessed = '2020-01-01T00:00:00.000Z' WHERE ref = ?",
      ).run(ref);

      const report = await backend.audit({ staleDays: 30 });
      expect(report.stale.map((s) => s.ref)).not.toContain(ref);
    });

    it('caps duplicate pairs at maxDuplicates', async () => {
      for (let i = 0; i < 5; i++) {
        await backend.remember({
          category: 'project',
          title: `dup ${i}`,
          content: 'loom loom loom',
        });
      }
      const report = await backend.audit({
        similarityThreshold: 0.5,
        maxDuplicates: 2,
      });
      expect(report.duplicates.length).toBeLessThanOrEqual(2);
    });

    it('dedupes (a,b) vs (b,a) duplicate pairs', async () => {
      await backend.remember({ category: 'project', title: 'X', content: 'loom' });
      await backend.remember({ category: 'project', title: 'Y', content: 'loom' });

      const report = await backend.audit({ similarityThreshold: 0.5 });
      expect(report.duplicates.length).toBeLessThanOrEqual(1);
    });
  });
});
