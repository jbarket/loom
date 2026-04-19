import { describe, it, expect } from 'vitest';
import { formatEntry, formatEntries } from './memory-list.js';
import type { MemoryEntry } from '../backends/types.js';

describe('memory-list', () => {
  const entry: MemoryEntry = {
    ref: 'project/earworm-phase1-abc12345',
    title: 'Earworm Phase 1 complete',
    category: 'project',
    project: 'drfish/earworm',
    created: '2026-03-31T07:00:00.000Z',
  };

  describe('formatEntry', () => {
    it('formats a memory entry with project', () => {
      const result = formatEntry(entry);
      expect(result).toContain('**Earworm Phase 1 complete**');
      expect(result).toContain('project');
      expect(result).toContain('[drfish/earworm]');
      expect(result).toContain('2026-03-31');
      expect(result).toContain('`project/earworm-phase1-abc12345`');
    });

    it('formats a memory entry without project', () => {
      const result = formatEntry({ ...entry, project: undefined });
      expect(result).not.toContain('[');
    });
  });

  describe('formatEntries', () => {
    it('formats multiple entries', () => {
      const result = formatEntries([entry, { ...entry, title: 'Another' }]);
      expect(result).toContain('Found 2 memories');
      expect(result).toContain('Earworm Phase 1 complete');
      expect(result).toContain('Another');
    });

    it('returns message for empty list', () => {
      expect(formatEntries([])).toBe('No memories found.');
    });
  });
});
