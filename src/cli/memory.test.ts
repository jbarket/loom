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

  describe('capture-propose queue', () => {
    it('propose stages a draft that proposals lists but list does NOT show', async () => {
      const proposed = await runCliCaptured(
        ['memory', 'propose', '--context-dir', tempDir,
          '--category', 'project', '--title', 'Drafted', '--content', 'a zorblax note', '--source', 'lane'],
      );
      expect(proposed.code).toBe(0);
      expect(proposed.stdout).toMatch(/Proposal staged/);

      // proposals lists the draft
      const queue = await runCliCaptured(['memory', 'proposals', '--context-dir', tempDir]);
      expect(queue.code).toBe(0);
      expect(queue.stdout).toMatch(/Drafted/);
      expect(queue.stdout).toMatch(/\[lane\]/);

      // but memory list does NOT (invisibility invariant)
      const listed = await runCliCaptured(['memory', 'list', '--context-dir', tempDir]);
      expect(listed.stdout).not.toMatch(/Drafted/);
      expect(listed.stdout).toMatch(/alpha/);
    });

    it('propose --json emits a ProposalRef; proposals --json emits the rows', async () => {
      const proposed = await runCliCaptured(
        ['memory', 'propose', '--context-dir', tempDir, '--json',
          '--category', 'self', '--title', 'J', '--content', 'json body'],
      );
      const ref = JSON.parse(proposed.stdout);
      expect(ref).toHaveProperty('id');
      expect(ref).toHaveProperty('uuid');

      const queue = await runCliCaptured(['memory', 'proposals', '--context-dir', tempDir, '--json']);
      const rows = JSON.parse(queue.stdout);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows[0].id).toBe(ref.id);
    });

    it('propose without required flags exits 2', async () => {
      const { code, stderr } = await runCliCaptured(
        ['memory', 'propose', '--context-dir', tempDir, '--title', 'no content'],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/--category, --title, and --content/);
    });

    it('ratify promotes a proposal into a real, listable memory and clears the queue', async () => {
      const proposed = await runCliCaptured(
        ['memory', 'propose', '--context-dir', tempDir, '--json',
          '--category', 'project', '--title', 'Promote', '--content', 'a flubber note'],
      );
      const { id } = JSON.parse(proposed.stdout);

      const ratified = await runCliCaptured(['memory', 'ratify', String(id), '--context-dir', tempDir]);
      expect(ratified.code).toBe(0);
      expect(ratified.stdout).toMatch(/ratified →/);

      // now it shows up in memory list, and the queue is empty
      const listed = await runCliCaptured(['memory', 'list', '--context-dir', tempDir]);
      expect(listed.stdout).toMatch(/Promote/);
      const queue = await runCliCaptured(['memory', 'proposals', '--context-dir', tempDir]);
      expect(queue.stdout).toMatch(/No pending proposals/);
    });

    it('ratify with overrides applies the edits', async () => {
      const proposed = await runCliCaptured(
        ['memory', 'propose', '--context-dir', tempDir, '--json',
          '--category', 'self', '--title', 'rough', '--content', 'rough body'],
      );
      const { id } = JSON.parse(proposed.stdout);

      await runCliCaptured(
        ['memory', 'ratify', String(id), '--context-dir', tempDir, '--title', 'polished'],
      );
      const listed = await runCliCaptured(['memory', 'list', '--context-dir', tempDir]);
      expect(listed.stdout).toMatch(/polished/);
      expect(listed.stdout).not.toMatch(/rough/);
    });

    it('ratify of an unknown id exits 3', async () => {
      const { code, stderr } = await runCliCaptured(
        ['memory', 'ratify', '9999', '--context-dir', tempDir],
      );
      expect(code).toBe(3);
      expect(stderr).toMatch(/not found/);
    });

    it('reject removes a pending proposal', async () => {
      const proposed = await runCliCaptured(
        ['memory', 'propose', '--context-dir', tempDir, '--json',
          '--category', 'self', '--title', 'discard', '--content', 'x'],
      );
      const { id } = JSON.parse(proposed.stdout);

      const rejected = await runCliCaptured(['memory', 'reject', String(id), '--context-dir', tempDir]);
      expect(rejected.code).toBe(0);
      expect(rejected.stdout).toMatch(/rejected and removed/);

      const queue = await runCliCaptured(['memory', 'proposals', '--context-dir', tempDir]);
      expect(queue.stdout).toMatch(/No pending proposals/);
    });

    it('reject of an unknown id exits 3', async () => {
      const { code, stderr } = await runCliCaptured(
        ['memory', 'reject', '9999', '--context-dir', tempDir],
      );
      expect(code).toBe(3);
      expect(stderr).toMatch(/not found/);
    });
  });
});
