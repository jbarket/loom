import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';
import { remember } from '../tools/remember.js';

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
});
