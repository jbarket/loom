import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock the backend factory so we exercise just the tool's input
// validation and string formatting — the underlying delete behavior
// is covered in sqlite-vec.test.ts.
vi.mock('../backends/index.js', () => ({
  createBackend: vi.fn(),
}));

import { forget } from './forget.js';
import { createBackend } from '../backends/index.js';

const mockCreateBackend = vi.mocked(createBackend);

function backendThatReturns(deleted: string[]) {
  return {
    forget: vi.fn().mockResolvedValue({ deleted }),
  } as never;
}

describe('forget tool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('returns guidance when no inputs provided', async () => {
      const result = await forget('/tmp/test', {});
      expect(result).toContain('Nothing to forget');
    });

    it('rejects title_pattern without scope guard', async () => {
      const result = await forget('/tmp/test', { title_pattern: 'Forgejo*' });
      expect(result).toContain('requires category or project');
    });
  });

  describe('single deletion', () => {
    it('formats success when ref deleted', async () => {
      mockCreateBackend.mockReturnValue(backendThatReturns(['user/prefs-abc123']));
      const result = await forget('/tmp/test', { ref: 'user/prefs-abc123' });
      expect(result).toContain('Memory forgotten: user/prefs-abc123');
    });

    it('returns Memory not found when ref missing', async () => {
      mockCreateBackend.mockReturnValue(backendThatReturns([]));
      const result = await forget('/tmp/test', { ref: 'user/nope' });
      expect(result).toContain('Memory not found');
      expect(result).toContain('user/nope');
    });

    it('returns Memory not found when category+title missing', async () => {
      mockCreateBackend.mockReturnValue(backendThatReturns([]));
      const result = await forget('/tmp/test', {
        category: 'user',
        title: 'Style',
      });
      expect(result).toContain('Memory not found');
      expect(result).toContain('user/Style');
    });
  });

  describe('bulk deletion', () => {
    it('formats success with count and ref list', async () => {
      mockCreateBackend.mockReturnValue(
        backendThatReturns(['user/a', 'user/b']),
      );
      const result = await forget('/tmp/test', { category: 'user' });
      expect(result).toContain('Forgot 2 memories');
      expect(result).toContain('- user/a');
      expect(result).toContain('- user/b');
    });

    it('reports when scope matches nothing', async () => {
      mockCreateBackend.mockReturnValue(backendThatReturns([]));
      const result = await forget('/tmp/test', { project: 'nonexistent' });
      expect(result).toContain('No memories matched');
    });
  });

  describe('pattern deletion', () => {
    it('reports pattern in no-match message', async () => {
      mockCreateBackend.mockReturnValue(backendThatReturns([]));
      const result = await forget('/tmp/test', {
        category: 'project',
        title_pattern: 'Forgejo sweep*',
      });
      expect(result).toContain('No memories matched pattern "Forgejo sweep*"');
    });

    it('formats success when pattern matches', async () => {
      mockCreateBackend.mockReturnValue(
        backendThatReturns(['project/sweep-1', 'project/sweep-2']),
      );
      const result = await forget('/tmp/test', {
        category: 'project',
        title_pattern: 'Forgejo sweep*',
      });
      expect(result).toContain('Forgot 2 memories');
    });
  });
});
