import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryToolHandler } from './memory-20250818.js';
import type { MemoryBackend, MemoryRef, MemoryMatch, MemoryEntry, ForgetResult, UpdateResult, PruneResult } from '../backends/types.js';

function makeMockBackend(overrides: Partial<MemoryBackend> = {}): MemoryBackend {
  return {
    remember: vi.fn().mockResolvedValue({ ref: 'reference/2026-01-01-test.md', category: 'reference', filename: '2026-01-01-test.md', title: 'Test' } satisfies MemoryRef),
    recall: vi.fn().mockResolvedValue([] as MemoryMatch[]),
    forget: vi.fn().mockResolvedValue({ deleted: [] } satisfies ForgetResult),
    update: vi.fn().mockResolvedValue({ updated: false } satisfies UpdateResult),
    prune: vi.fn().mockResolvedValue({ expired: [], stale: [] } satisfies PruneResult),
    list: vi.fn().mockResolvedValue([] as MemoryEntry[]),
    ...overrides,
  };
}

describe('createMemoryToolHandler', () => {
  let backend: MemoryBackend;
  let handle: ReturnType<typeof createMemoryToolHandler>;

  beforeEach(() => {
    backend = makeMockBackend();
    handle = createMemoryToolHandler(backend);
  });

  // ── create / insert ────────────────────────────────────────────────────────

  it('create routes to backend.remember', async () => {
    const result = await handle({ action: 'create', content: 'Test memory', title: 'My test', category: 'user' });
    expect(result.isError).toBeFalsy();
    expect(backend.remember).toHaveBeenCalledWith(expect.objectContaining({
      category: 'user',
      title: 'My test',
      content: 'Test memory',
    }));
    expect(result.content[0].text).toContain('Memory stored');
  });

  it('insert is an alias for create', async () => {
    const result = await handle({ action: 'insert', content: 'Test content', category: 'project' });
    expect(result.isError).toBeFalsy();
    expect(backend.remember).toHaveBeenCalled();
  });

  it('create uses "reference" category by default', async () => {
    await handle({ action: 'create', content: 'Test memory' });
    expect(backend.remember).toHaveBeenCalledWith(expect.objectContaining({ category: 'reference' }));
  });

  it('create fails if content is empty', async () => {
    const result = await handle({ action: 'create', content: '', category: 'user' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires content');
  });

  it('create refuses secret-like content', async () => {
    const result = await handle({ action: 'create', content: 'My API key is sk-abc123def456ghi789jkl', category: 'user' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('refused');
    expect(backend.remember).not.toHaveBeenCalled();
  });

  it('create fails with invalid category', async () => {
    const result = await handle({ action: 'create', content: 'Test', category: 'secrets' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid category');
  });

  // ── list ───────────────────────────────────────────────────────────────────

  it('list routes to backend.list and returns formatted entries', async () => {
    (backend.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ref: 'user/2026-01-01-pref.md', title: 'User pref', category: 'user', created: '2026-01-01T00:00:00Z' },
    ] satisfies MemoryEntry[]);
    const result = await handle({ action: 'list' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('user/2026-01-01-pref.md');
    expect(result.content[0].text).toContain('User pref');
  });

  it('list returns empty message when no memories', async () => {
    const result = await handle({ action: 'list' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No memories found');
  });

  it('list passes category filter to backend', async () => {
    await handle({ action: 'list', category: 'project', limit: 10 });
    expect(backend.list).toHaveBeenCalledWith(expect.objectContaining({ category: 'project', limit: 10 }));
  });

  it('list fails with invalid category', async () => {
    const result = await handle({ action: 'list', category: 'system' });
    expect(result.isError).toBe(true);
  });

  // ── view ───────────────────────────────────────────────────────────────────

  it('view fails without id', async () => {
    const result = await handle({ action: 'view' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('view requires id');
  });

  it('view returns memory content when found', async () => {
    (backend.recall as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        path: 'user/2026-01-01-test.md',
        title: 'Test',
        category: 'user',
        created: '2026-01-01T00:00:00Z',
        content: 'Test content here',
        relevance: 1,
      },
    ] satisfies MemoryMatch[]);
    const result = await handle({ action: 'view', id: 'user/2026-01-01-test.md' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Test content here');
  });

  it('view returns not-found when path does not match any recall result', async () => {
    (backend.recall as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        path: 'user/different-file.md',
        title: 'Other',
        category: 'user',
        created: '2026-01-01T00:00:00Z',
        content: 'Other content',
        relevance: 0.5,
      },
    ] satisfies MemoryMatch[]);
    const result = await handle({ action: 'view', id: 'user/target-file.md' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  // ── update ─────────────────────────────────────────────────────────────────

  it('update routes to backend.update by id', async () => {
    (backend.update as ReturnType<typeof vi.fn>).mockResolvedValue({ updated: true, ref: 'user/test.md' } satisfies UpdateResult);
    const result = await handle({ action: 'update', id: 'user/test.md', content: 'New content' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Updated');
  });

  it('update fails without id or category+title', async () => {
    const result = await handle({ action: 'update', content: 'New content' });
    expect(result.isError).toBe(true);
  });

  it('update returns not-found when backend reports not updated', async () => {
    const result = await handle({ action: 'update', id: 'user/missing.md', content: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('update refuses secret-like content', async () => {
    const result = await handle({ action: 'update', id: 'user/test.md', content: 'ghp_abc123def456ghi789jkl012mno345pqr' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('refused');
    expect(backend.update).not.toHaveBeenCalled();
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  it('delete routes to backend.forget by id', async () => {
    (backend.forget as ReturnType<typeof vi.fn>).mockResolvedValue({ deleted: ['user/test.md'] } satisfies ForgetResult);
    const result = await handle({ action: 'delete', id: 'user/test.md' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Deleted');
  });

  it('delete fails without id or category+title', async () => {
    const result = await handle({ action: 'delete' });
    expect(result.isError).toBe(true);
  });

  it('delete returns not-found when nothing was deleted', async () => {
    const result = await handle({ action: 'delete', id: 'user/missing.md' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  // ── unknown action ─────────────────────────────────────────────────────────

  it('returns error for unknown action', async () => {
    const result = await handle({ action: 'frobnicate' as never });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unknown action');
  });
});
