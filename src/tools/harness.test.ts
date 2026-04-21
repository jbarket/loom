import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { harnessInit } from './harness.js';

describe('harnessInit (MCP)', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-harness-mcp-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('creates a manifest and returns summary text', async () => {
    const text = await harnessInit(ctx, { name: 'claude-code' });
    expect(text).toMatch(/claude-code/);
    expect(text).toMatch(/created/);
    const body = await readFile(resolve(ctx, 'harnesses', 'claude-code.md'), 'utf-8');
    expect(body).toContain('harness: claude-code');
  });

  it('reports skipped-exists on re-init', async () => {
    await harnessInit(ctx, { name: 'codex' });
    const text = await harnessInit(ctx, { name: 'codex' });
    expect(text).toMatch(/skipped-exists/);
  });

  it('overwrites with overwrite=true', async () => {
    await harnessInit(ctx, { name: 'codex' });
    await writeFile(resolve(ctx, 'harnesses', 'codex.md'), '# custom\n', 'utf-8');
    const text = await harnessInit(ctx, { name: 'codex', overwrite: true });
    expect(text).toMatch(/overwritten/);
  });

  it('throws for invalid names', async () => {
    await expect(harnessInit(ctx, { name: '' })).rejects.toThrow(/name/);
    await expect(harnessInit(ctx, { name: 'foo/bar' })).rejects.toThrow(/name/);
  });
});
