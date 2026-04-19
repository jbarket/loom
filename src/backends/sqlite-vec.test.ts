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
});
