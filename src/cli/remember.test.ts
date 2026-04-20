import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';

describe('loom remember', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-cli-remember-'));
    await writeFile(join(tempDir, 'IDENTITY.md'), '# Creed');
  });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  it('writes memory with body from stdin (human output)', async () => {
    const { stdout, code } = await runCliCaptured(
      ['remember', 'my note', '--category', 'reference', '--context-dir', tempDir],
      { stdin: 'body from stdin' },
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/Remembered/i);
  });

  it('emits MemoryRef on --json', async () => {
    const { stdout, code } = await runCliCaptured(
      ['remember', 'json note', '--category', 'reference', '--context-dir', tempDir, '--json'],
      { stdin: 'body' },
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('ref');
    expect(parsed).toHaveProperty('title', 'json note');
  });

  it('rejects empty body with exit 2', async () => {
    const { stderr, code } = await runCliCaptured(
      ['remember', 'empty', '--category', 'reference', '--context-dir', tempDir],
      { stdin: '' },
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/body/i);
  });

  it('requires a title (exit 2)', async () => {
    const { stderr, code } = await runCliCaptured(
      ['remember', '--context-dir', tempDir],
      { stdin: 'body' },
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/title/i);
  });

  it('defaults category to "general" when omitted', async () => {
    const { stdout, code } = await runCliCaptured(
      ['remember', 'def', '--context-dir', tempDir, '--json'],
      { stdin: 'body' },
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.category).toBe('general');
    // Context dir exists (readdir sanity) — backend stores in sqlite, not nested dirs.
    const entries = await readdir(tempDir);
    expect(entries.length).toBeGreaterThan(0);
  });
});
