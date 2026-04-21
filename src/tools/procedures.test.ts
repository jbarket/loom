import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { procedureList, procedureShow, procedureAdopt } from './procedures.js';

describe('procedureList (MCP)', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-proc-mcp-list-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('returns a human-readable summary listing all seeds', async () => {
    const text = await procedureList(ctx);
    expect(text).toMatch(/verify-before-completion/);
    expect(text).toMatch(/RLHF-resistance/);
    expect(text).toMatch(/adopted/i);
  });

  it('marks adopted keys distinctly from un-adopted', async () => {
    await mkdir(resolve(ctx, 'procedures'), { recursive: true });
    await writeFile(resolve(ctx, 'procedures', 'cold-testing.md'), '# x', 'utf-8');
    const text = await procedureList(ctx);
    const coldLine = text.split('\n').find((l) => l.includes('cold-testing')) ?? '';
    const verifyLine = text.split('\n').find((l) => l.includes('verify-before-completion')) ?? '';
    expect(coldLine).not.toEqual(verifyLine);
  });
});

describe('procedureShow (MCP)', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-proc-mcp-show-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('returns template text for un-adopted key', async () => {
    const text = await procedureShow(ctx, 'cold-testing');
    expect(text).toContain('⚠ This is a seed template');
  });

  it('returns adopted body when adopted', async () => {
    await mkdir(resolve(ctx, 'procedures'), { recursive: true });
    await writeFile(
      resolve(ctx, 'procedures', 'cold-testing.md'),
      '# cold-testing\n**Rule:** my custom\n',
      'utf-8',
    );
    const text = await procedureShow(ctx, 'cold-testing');
    expect(text).toContain('my custom');
  });

  it('throws for unknown key', async () => {
    await expect(procedureShow(ctx, 'bogus')).rejects.toThrow(/bogus/);
  });
});

describe('procedureAdopt (MCP)', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-proc-mcp-adopt-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('adopts requested keys and returns summary text', async () => {
    const text = await procedureAdopt(ctx, { keys: ['cold-testing', 'confidence-calibration'] });
    expect(text).toMatch(/cold-testing.*created/);
    expect(text).toMatch(/confidence-calibration.*created/);
    const body = await readFile(resolve(ctx, 'procedures', 'cold-testing.md'), 'utf-8');
    expect(body).toContain('⚠ This is a seed template');
  });

  it('reports skipped-exists on re-run', async () => {
    await procedureAdopt(ctx, { keys: ['cold-testing'] });
    const text = await procedureAdopt(ctx, { keys: ['cold-testing'] });
    expect(text).toMatch(/cold-testing.*skipped-exists/);
  });

  it('overwrites when overwrite=true', async () => {
    await procedureAdopt(ctx, { keys: ['cold-testing'] });
    const path = resolve(ctx, 'procedures', 'cold-testing.md');
    await writeFile(path, '# custom edits\n', 'utf-8');
    const text = await procedureAdopt(ctx, { keys: ['cold-testing'], overwrite: true });
    expect(text).toMatch(/cold-testing.*overwritten/);
    const body = await readFile(path, 'utf-8');
    expect(body).toContain('⚠ This is a seed template');
  });

  it('throws on empty keys', async () => {
    await expect(procedureAdopt(ctx, { keys: [] })).rejects.toThrow(/keys/);
  });

  it('throws on unknown key with valid-keys list in message', async () => {
    await expect(procedureAdopt(ctx, { keys: ['bogus'] }))
      .rejects.toThrow(/bogus/);
  });
});
