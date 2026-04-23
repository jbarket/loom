import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';
import { remember } from '../tools/remember.js';
import { parseJsonl } from '../tools/memory-import.js';

describe('loom memory', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-cli-memory-'));
    await writeFile(join(tempDir, 'IDENTITY.md'), '# Creed');
    await remember(tempDir, { category: 'reference', title: 'alpha', content: 'a' });
    await remember(tempDir, { category: 'reference', title: 'beta',  content: 'b' });
  });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  describe('list', () => {
    it('prints entries in human format', async () => {
      const { stdout, code } = await runCliCaptured(
        ['memory', 'list', '--context-dir', tempDir],
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/alpha/);
      expect(stdout).toMatch(/beta/);
    });

    it('emits MemoryEntry[] when --json', async () => {
      const { stdout, code } = await runCliCaptured(
        ['memory', 'list', '--context-dir', tempDir, '--json'],
      );
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });
  });

  describe('prune', () => {
    it('reports clean store when nothing expired', async () => {
      const { stdout, code } = await runCliCaptured(
        ['memory', 'prune', '--context-dir', tempDir],
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/healthy|No expired/i);
    });

    it('supports --json', async () => {
      const { stdout, code } = await runCliCaptured(
        ['memory', 'prune', '--context-dir', tempDir, '--json'],
      );
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed).toHaveProperty('expired');
      expect(parsed).toHaveProperty('stale');
    });
  });

  it('returns exit 2 for unknown memory subcommand', async () => {
    const { stderr, code } = await runCliCaptured(
      ['memory', 'bogus', '--context-dir', tempDir],
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/list|prune/);
  });

  describe('export', () => {
    it('emits one JSONL line per memory with required fields', async () => {
      const { stdout, code } = await runCliCaptured(
        ['memory', 'export', '--context-dir', tempDir],
      );
      expect(code).toBe(0);
      const lines = stdout.trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(2);
      const entry = JSON.parse(lines[0]);
      expect(entry).toHaveProperty('ref');
      expect(entry).toHaveProperty('category', 'reference');
      expect(entry).toHaveProperty('title');
      expect(entry).toHaveProperty('content');
      expect(entry).toHaveProperty('created');
      expect(entry).toHaveProperty('metadata');
    });

    it('filters by --category', async () => {
      await remember(tempDir, { category: 'feedback', title: 'gamma', content: 'g' });
      const { stdout, code } = await runCliCaptured(
        ['memory', 'export', '--category', 'reference', '--context-dir', tempDir],
      );
      expect(code).toBe(0);
      const lines = stdout.trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(2);
      for (const line of lines) {
        expect(JSON.parse(line).category).toBe('reference');
      }
    });

    it('emits empty output when store is empty', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'loom-empty-'));
      try {
        await writeFile(join(emptyDir, 'IDENTITY.md'), '# Creed');
        const { stdout, code } = await runCliCaptured(
          ['memory', 'export', '--context-dir', emptyDir],
        );
        expect(code).toBe(0);
        expect(stdout.trim()).toBe('');
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('import', () => {
    it('imports JSONL from stdin into a fresh context dir', async () => {
      const { stdout: exportOut } = await runCliCaptured(
        ['memory', 'export', '--context-dir', tempDir],
      );

      const freshDir = await mkdtemp(join(tmpdir(), 'loom-import-'));
      try {
        await writeFile(join(freshDir, 'IDENTITY.md'), '# Creed');
        const { stdout, code } = await runCliCaptured(
          ['memory', 'import', '--context-dir', freshDir, '--json'],
          { stdin: exportOut },
        );
        expect(code).toBe(0);
        const result = JSON.parse(stdout);
        expect(result.imported).toBe(2);
        expect(result.updated).toBe(0);
        expect(result.skipped).toBe(0);
      } finally {
        await rm(freshDir, { recursive: true, force: true });
      }
    });

    it('import is idempotent — second run skips unchanged entries', async () => {
      const { stdout: exportOut } = await runCliCaptured(
        ['memory', 'export', '--context-dir', tempDir],
      );

      const freshDir = await mkdtemp(join(tmpdir(), 'loom-idem-'));
      try {
        await writeFile(join(freshDir, 'IDENTITY.md'), '# Creed');
        await runCliCaptured(
          ['memory', 'import', '--context-dir', freshDir, '--json'],
          { stdin: exportOut },
        );
        const { stdout, code } = await runCliCaptured(
          ['memory', 'import', '--context-dir', freshDir, '--json'],
          { stdin: exportOut },
        );
        expect(code).toBe(0);
        const result = JSON.parse(stdout);
        expect(result.imported).toBe(0);
        expect(result.updated).toBe(0);
        expect(result.skipped).toBe(2);
      } finally {
        await rm(freshDir, { recursive: true, force: true });
      }
    });

    it('round-trip: imported memories appear in memory list', async () => {
      const { stdout: exportOut } = await runCliCaptured(
        ['memory', 'export', '--context-dir', tempDir],
      );

      const freshDir = await mkdtemp(join(tmpdir(), 'loom-roundtrip-'));
      try {
        await writeFile(join(freshDir, 'IDENTITY.md'), '# Creed');
        await runCliCaptured(
          ['memory', 'import', '--context-dir', freshDir],
          { stdin: exportOut },
        );
        const { stdout, code } = await runCliCaptured(
          ['memory', 'list', '--context-dir', freshDir, '--json'],
        );
        expect(code).toBe(0);
        const entries = JSON.parse(stdout);
        expect(entries.length).toBe(2);
        const titles = entries.map((e: { title: string }) => e.title);
        expect(titles).toContain('alpha');
        expect(titles).toContain('beta');
      } finally {
        await rm(freshDir, { recursive: true, force: true });
      }
    });

    it('imports from a file argument', async () => {
      const { stdout: exportOut } = await runCliCaptured(
        ['memory', 'export', '--context-dir', tempDir],
      );

      const freshDir = await mkdtemp(join(tmpdir(), 'loom-fileinput-'));
      try {
        await writeFile(join(freshDir, 'IDENTITY.md'), '# Creed');
        const jsonlFile = join(freshDir, 'memories.jsonl');
        await writeFile(jsonlFile, exportOut, 'utf-8');

        const { stdout, code } = await runCliCaptured(
          ['memory', 'import', jsonlFile, '--context-dir', freshDir, '--json'],
        );
        expect(code).toBe(0);
        const result = JSON.parse(stdout);
        expect(result.imported).toBe(2);
      } finally {
        await rm(freshDir, { recursive: true, force: true });
      }
    });

    it('returns exit 1 for invalid JSON', async () => {
      const { stderr, code } = await runCliCaptured(
        ['memory', 'import', '--context-dir', tempDir],
        { stdin: 'not valid json\n' },
      );
      expect(code).toBe(1);
      expect(stderr).toMatch(/Invalid JSON/);
    });

    it('returns exit 2 when stdin is a TTY and no file given', async () => {
      const { stderr, code } = await runCliCaptured(
        ['memory', 'import', '--context-dir', tempDir],
        // No stdin → stdinIsTTY = true
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/stdin|file/i);
    });
  });

  describe('parseJsonl', () => {
    it('parses valid JSONL', () => {
      const line = JSON.stringify({
        ref: 'reference/foo-abc12345',
        category: 'reference',
        title: 'foo',
        content: 'bar',
        metadata: {},
        created: '2026-01-01T00:00:00.000Z',
      });
      const entries = parseJsonl(line + '\n');
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('foo');
    });

    it('skips blank lines', () => {
      const line = JSON.stringify({ ref: 'x', category: 'c', title: 't', content: 'c', metadata: {}, created: '2026-01-01T00:00:00.000Z' });
      expect(parseJsonl('\n' + line + '\n\n')).toHaveLength(1);
    });

    it('throws with line number on bad JSON', () => {
      const validLine = JSON.stringify({ ref: 'x', category: 'c', title: 't', content: 'c', metadata: {}, created: '2026-01-01T00:00:00.000Z' });
      expect(() => parseJsonl(validLine + '\nnot json')).toThrow(/line 2/);
    });
  });
});
