import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { harnessInit, harnessDescribe } from './harness.js';

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

describe('harnessDescribe (MCP, peer-scoped)', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-harness-describe-mcp-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('writes a manifest keyed to the connected peer (normalized)', async () => {
    const text = await harnessDescribe(ctx, { content: '## Surface\nCodex.\n' }, 'Codex CLI');
    expect(text).toMatch(/codex-cli/);
    expect(text).toMatch(/created/);
    const body = await readFile(resolve(ctx, 'harnesses', 'codex-cli.md'), 'utf-8');
    expect(body).toContain('harness: codex-cli');
    expect(body).toContain('## Surface');
  });

  it('resolves the peer to an existing harness via answersTo (cannot fork a duplicate)', async () => {
    await mkdir(resolve(ctx, 'harnesses'), { recursive: true });
    await writeFile(
      resolve(ctx, 'harnesses', 'claude-desktop.md'),
      '---\nharness: claude-desktop\nanswersTo: claude-ai\n---\n\noriginal\n',
    );
    const text = await harnessDescribe(ctx, { content: 'updated body' }, 'claude-ai (via mcp-remote 0.1.37)');
    expect(text).toMatch(/claude-desktop/);
    // It wrote claude-desktop.md, NOT a new claude-ai.md.
    const body = await readFile(resolve(ctx, 'harnesses', 'claude-desktop.md'), 'utf-8');
    expect(body).toContain('updated body');
    const aliasMissing = await readFile(resolve(ctx, 'harnesses', 'claude-ai.md'), 'utf-8').catch(() => null);
    expect(aliasMissing).toBeNull();
  });

  it('refuses when there is no connected peer', async () => {
    const text = await harnessDescribe(ctx, { content: 'body' }, undefined);
    expect(text).toMatch(/Error/);
    expect(text).toMatch(/clientInfo|connected peer/);
  });
});
