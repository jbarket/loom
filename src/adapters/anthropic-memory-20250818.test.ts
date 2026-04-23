import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../backends/index.js', () => ({ createBackend: vi.fn() }));
vi.mock('../tools/identity.js', () => ({ loadIdentity: vi.fn() }));

import { AnthropicMemoryAdapter, handleMemoryToolCall, MEMORY_TOOL_DEFINITION, MEMORY_TOOL_NAME } from './anthropic-memory-20250818.js';
import { createBackend } from '../backends/index.js';
import { loadIdentity } from '../tools/identity.js';

const mockCreateBackend = vi.mocked(createBackend);
const mockLoadIdentity = vi.mocked(loadIdentity);

const CTX = '/tmp/loom-test';

interface MockBackend {
  list: ReturnType<typeof vi.fn>;
  recall: ReturnType<typeof vi.fn>;
  remember: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  forget: ReturnType<typeof vi.fn>;
  prune: ReturnType<typeof vi.fn>;
}

function makeBackend(overrides: Partial<MockBackend> = {}): MockBackend {
  return {
    list: vi.fn().mockResolvedValue([]),
    recall: vi.fn().mockResolvedValue([]),
    remember: vi.fn().mockResolvedValue({
      ref: 'self/test-abc123',
      title: 'Test',
      category: 'self',
      filename: 'test-abc123.md',
    }),
    update: vi.fn().mockResolvedValue({ updated: true, ref: 'self/test-abc123' }),
    forget: vi.fn().mockResolvedValue({ deleted: ['self/test-abc123'] }),
    prune: vi.fn().mockResolvedValue({ expired: [], stale: [] }),
    ...overrides,
  };
}

function setup(overrides: Partial<MockBackend> = {}) {
  const backend = makeBackend(overrides);
  mockCreateBackend.mockReturnValue(backend as never);
  return { adapter: new AnthropicMemoryAdapter(CTX), backend };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Exports ──────────────────────────────────────────────────────────────────

describe('module exports', () => {
  it('exports MEMORY_TOOL_NAME as "memory"', () => {
    expect(MEMORY_TOOL_NAME).toBe('memory');
  });

  it('MEMORY_TOOL_DEFINITION has required shape', () => {
    expect(MEMORY_TOOL_DEFINITION.name).toBe('memory');
    expect(MEMORY_TOOL_DEFINITION.input_schema.required).toContain('action');
    const actions = MEMORY_TOOL_DEFINITION.input_schema.properties.action.enum;
    expect(actions).toEqual(['view', 'list', 'create', 'update', 'insert', 'delete']);
  });
});

// ─── view ─────────────────────────────────────────────────────────────────────

describe('view', () => {
  it('loads identity payload for ref="_identity"', async () => {
    setup();
    mockLoadIdentity.mockResolvedValue('# Identity\nI am Art.');
    const { adapter } = setup();
    const result = await adapter.handle({ action: 'view', ref: '_identity' });
    expect(result).toContain('# Identity');
    expect(mockLoadIdentity).toHaveBeenCalledWith(CTX);
  });

  it('returns memory content when ref matches', async () => {
    const { adapter } = setup({
      list: vi.fn().mockResolvedValue([
        { ref: 'user/prefs-abc', title: 'Preferences', category: 'user', created: '2026-01-01T00:00:00Z' },
      ]),
      recall: vi.fn().mockResolvedValue([
        {
          path: 'user/prefs-abc',
          title: 'Preferences',
          category: 'user',
          content: 'User likes dark mode.',
          created: '2026-01-01T00:00:00Z',
          relevance: 1,
        },
      ]),
    });
    const result = await adapter.handle({ action: 'view', ref: 'user/prefs-abc' });
    expect(result).toContain('## Preferences');
    expect(result).toContain('User likes dark mode.');
    expect(result).toContain('Ref: user/prefs-abc');
  });

  it('returns not-found when ref is absent from list', async () => {
    const { adapter } = setup({ list: vi.fn().mockResolvedValue([]) });
    const result = await adapter.handle({ action: 'view', ref: 'user/nope' });
    expect(result).toContain('Memory not found');
    expect(result).toContain('user/nope');
  });

  it('reports when content cannot be retrieved after metadata is found', async () => {
    const { adapter } = setup({
      list: vi.fn().mockResolvedValue([
        { ref: 'self/orphan', title: 'Orphan', category: 'self', created: '2026-01-01T00:00:00Z' },
      ]),
      recall: vi.fn().mockResolvedValue([]), // no matching content
    });
    const result = await adapter.handle({ action: 'view', ref: 'self/orphan' });
    expect(result).toContain('content could not be retrieved');
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('list', () => {
  it('returns no-memories message when store is empty', async () => {
    const { adapter } = setup({ list: vi.fn().mockResolvedValue([]) });
    const result = await adapter.handle({ action: 'list' });
    expect(result).toBe('No memories found.');
  });

  it('formats entries with ref, title, category, and date', async () => {
    const { adapter } = setup({
      list: vi.fn().mockResolvedValue([
        { ref: 'user/prefs', title: 'Preferences', category: 'user', created: '2026-01-01T00:00:00Z' },
      ]),
    });
    const result = await adapter.handle({ action: 'list' });
    expect(result).toContain('1 memories');
    expect(result).toContain('user/prefs');
    expect(result).toContain('Preferences');
    expect(result).toContain('2026-01-01');
  });

  it('includes project tag when present', async () => {
    const { adapter } = setup({
      list: vi.fn().mockResolvedValue([
        { ref: 'project/loom-ctx', title: 'Loom Context', category: 'project', project: 'loom', created: '2026-01-01T00:00:00Z' },
      ]),
    });
    const result = await adapter.handle({ action: 'list' });
    expect(result).toContain('[loom]');
  });

  it('passes category, project, and limit filters through', async () => {
    const { adapter, backend } = setup({ list: vi.fn().mockResolvedValue([]) });
    await adapter.handle({ action: 'list', category: 'project', project: 'loom', limit: 10 });
    expect(backend.list).toHaveBeenCalledWith({ category: 'project', project: 'loom', limit: 10 });
  });

  it('defaults limit to 50 when not specified', async () => {
    const { adapter, backend } = setup({ list: vi.fn().mockResolvedValue([]) });
    await adapter.handle({ action: 'list' });
    expect(backend.list).toHaveBeenCalledWith({ category: undefined, project: undefined, limit: 50 });
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('create', () => {
  it('stores a memory and returns the ref', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'create',
      title: 'Test Memory',
      content: 'Some safe content.',
      category: 'user',
    });
    expect(result).toContain('Memory stored');
    expect(result).toContain('self/test-abc123');
    expect(backend.remember).toHaveBeenCalledWith({
      title: 'Test Memory',
      content: 'Some safe content.',
      category: 'user',
      project: undefined,
      ttl: undefined,
    });
  });

  it('defaults category to "self" when omitted', async () => {
    const { adapter, backend } = setup();
    await adapter.handle({ action: 'create', title: 'T', content: 'C' });
    expect(backend.remember).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'self' }),
    );
  });

  it('passes project and ttl through', async () => {
    const { adapter, backend } = setup();
    await adapter.handle({ action: 'create', title: 'T', content: 'C', project: 'loom', ttl: '30d' });
    expect(backend.remember).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'loom', ttl: '30d' }),
    );
  });

  it('refuses content with OpenAI API key pattern', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'create',
      title: 'Key',
      content: 'My secret is sk-aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgH',
    });
    expect(result).toContain('Refused');
    expect(backend.remember).not.toHaveBeenCalled();
  });

  it('refuses content with AWS access key pattern', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'create',
      title: 'AWS',
      content: 'AKIAIOSFODNN7EXAMPLE is my access key',
    });
    expect(result).toContain('Refused');
    expect(backend.remember).not.toHaveBeenCalled();
  });

  it('refuses content with PEM private key header', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'create',
      title: 'Key',
      content: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADA...\n-----END PRIVATE KEY-----',
    });
    expect(result).toContain('Refused');
    expect(backend.remember).not.toHaveBeenCalled();
  });

  it('refuses content with URL credentials', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'create',
      title: 'DB',
      content: 'postgres://admin:s3cr3tpass@db.example.com/mydb',
    });
    expect(result).toContain('Refused');
    expect(backend.remember).not.toHaveBeenCalled();
  });

  it('refuses sleeve-scoped categories', async () => {
    const { adapter, backend } = setup();
    for (const cat of ['todo', 'scratch', 'session', 'task', 'scratchpad']) {
      const result = await adapter.handle({
        action: 'create',
        title: 'T',
        content: 'C',
        category: cat,
      });
      expect(result).toContain('Refused');
      expect(result).toContain('sleeve-scoped');
    }
    expect(backend.remember).not.toHaveBeenCalled();
  });

  it('allows safe content without any secrets', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'create',
      title: 'User Style',
      content: 'User prefers TypeScript and concise responses.',
      category: 'user',
    });
    expect(result).toContain('Memory stored');
    expect(backend.remember).toHaveBeenCalledTimes(1);
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('update', () => {
  it('updates content and returns the ref', async () => {
    const { adapter, backend } = setup({
      update: vi.fn().mockResolvedValue({ updated: true, ref: 'user/prefs' }),
    });
    const result = await adapter.handle({
      action: 'update',
      ref: 'user/prefs',
      content: 'Updated content.',
    });
    expect(result).toContain('Memory updated');
    expect(result).toContain('user/prefs');
    expect(backend.update).toHaveBeenCalledWith({
      ref: 'user/prefs',
      content: 'Updated content.',
      metadata: undefined,
    });
  });

  it('returns not-found message when ref is absent', async () => {
    const { adapter } = setup({ update: vi.fn().mockResolvedValue({ updated: false }) });
    const result = await adapter.handle({ action: 'update', ref: 'user/nope', content: 'x' });
    expect(result).toContain('Memory not found');
    expect(result).toContain('user/nope');
  });

  it('refuses updated content containing a GitHub token', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'update',
      ref: 'user/prefs',
      content: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abc',
    });
    expect(result).toContain('Refused');
    expect(backend.update).not.toHaveBeenCalled();
  });

  it('passes metadata through without content', async () => {
    const { adapter, backend } = setup();
    await adapter.handle({
      action: 'update',
      ref: 'self/foo',
      metadata: { tag: 'important' },
    });
    expect(backend.update).toHaveBeenCalledWith({
      ref: 'self/foo',
      content: undefined,
      metadata: { tag: 'important' },
    });
  });
});

// ─── insert ───────────────────────────────────────────────────────────────────

describe('insert', () => {
  it('batch-stores memories and returns all refs', async () => {
    const { adapter, backend } = setup({
      remember: vi.fn()
        .mockResolvedValueOnce({ ref: 'self/a-111', title: 'A', category: 'self', filename: 'a-111.md' })
        .mockResolvedValueOnce({ ref: 'project/b-222', title: 'B', category: 'project', filename: 'b-222.md' }),
    });
    const result = await adapter.handle({
      action: 'insert',
      memories: [
        { title: 'A', content: 'Content A' },
        { title: 'B', content: 'Content B', category: 'project' },
      ],
    });
    expect(result).toContain('Stored 2 memories');
    expect(result).toContain('self/a-111');
    expect(result).toContain('project/b-222');
    expect(backend.remember).toHaveBeenCalledTimes(2);
  });

  it('skips memories with secrets and reports them', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'insert',
      memories: [
        { title: 'Good', content: 'Safe content.' },
        { title: 'Bad', content: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.faketoken' },
      ],
    });
    expect(result).toContain('Stored 1');
    expect(result).toContain('Refused 1');
    expect(result).toContain('Bad (secret detected)');
    expect(backend.remember).toHaveBeenCalledTimes(1);
  });

  it('defaults category to "self" for each memory', async () => {
    const { adapter, backend } = setup();
    await adapter.handle({
      action: 'insert',
      memories: [{ title: 'T', content: 'C' }],
    });
    expect(backend.remember).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'self' }),
    );
  });

  it('reports no-op for empty memories array', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({ action: 'insert', memories: [] });
    expect(result).toBe('No memories to store.');
    expect(backend.remember).not.toHaveBeenCalled();
  });

  it('skips sleeve-scoped entries and includes them in the refused list', async () => {
    const { adapter, backend } = setup();
    const result = await adapter.handle({
      action: 'insert',
      memories: [
        { title: 'Good', content: 'Fine.', category: 'user' },
        { title: 'Session note', content: 'temp', category: 'scratch' },
      ],
    });
    expect(result).toContain('Stored 1');
    expect(result).toContain('Refused 1');
    expect(backend.remember).toHaveBeenCalledTimes(1);
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe('delete', () => {
  it('deletes a memory by ref and reports it', async () => {
    const { adapter, backend } = setup({
      forget: vi.fn().mockResolvedValue({ deleted: ['user/prefs-abc'] }),
    });
    const result = await adapter.handle({ action: 'delete', ref: 'user/prefs-abc' });
    expect(result).toContain('Memory deleted');
    expect(result).toContain('user/prefs-abc');
    expect(backend.forget).toHaveBeenCalledWith({ ref: 'user/prefs-abc' });
  });

  it('returns not-found when ref does not exist', async () => {
    const { adapter } = setup({ forget: vi.fn().mockResolvedValue({ deleted: [] }) });
    const result = await adapter.handle({ action: 'delete', ref: 'user/nope' });
    expect(result).toContain('Memory not found');
    expect(result).toContain('user/nope');
  });
});

// ─── handleMemoryToolCall convenience function ────────────────────────────────

describe('handleMemoryToolCall', () => {
  it('routes to the correct verb without instantiating the class directly', async () => {
    const backend = makeBackend({ list: vi.fn().mockResolvedValue([]) });
    mockCreateBackend.mockReturnValue(backend as never);
    const result = await handleMemoryToolCall({ action: 'list' }, CTX);
    expect(result).toBe('No memories found.');
  });
});
