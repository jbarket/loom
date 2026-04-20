import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';

describe('loom pursuits', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-cli-pursuits-'));
    await writeFile(join(tempDir, 'IDENTITY.md'), '# Creed');
  });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  it('lists pursuits when file is missing', async () => {
    const { stdout, code } = await runCliCaptured(
      ['pursuits', 'list', '--context-dir', tempDir],
    );
    expect(code).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  it('adds a pursuit with --goal', async () => {
    const { code } = await runCliCaptured(
      ['pursuits', 'add', 'widget', '--goal', 'Ship the widget', '--context-dir', tempDir],
    );
    expect(code).toBe(0);
    const { stdout } = await runCliCaptured(
      ['pursuits', 'list', '--context-dir', tempDir],
    );
    expect(stdout).toMatch(/widget/);
    expect(stdout).toMatch(/Ship the widget/);
  });

  it('completes a pursuit', async () => {
    await runCliCaptured(
      ['pursuits', 'add', 'ship-it', '--goal', 'Done-ish', '--context-dir', tempDir],
    );
    const { code } = await runCliCaptured(
      ['pursuits', 'complete', 'ship-it', '--context-dir', tempDir],
    );
    expect(code).toBe(0);
  });

  it('exits 2 for unknown action', async () => {
    const { stderr, code } = await runCliCaptured(
      ['pursuits', 'frobnicate', '--context-dir', tempDir],
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/list|add|update|complete|park|resume/);
  });

  it('exits 2 when add/update/complete lacks a name', async () => {
    const { code } = await runCliCaptured(
      ['pursuits', 'add', '--context-dir', tempDir],
    );
    expect(code).toBe(2);
  });
});
