import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runCliCaptured } from './test-helpers.js';

describe('loom procedures list', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-proc-cli-list-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('prints a human table with all seed keys and adoption state', async () => {
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'list', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/verify-before-completion/);
    expect(stdout).toMatch(/cold-testing/);
    expect(stdout).toMatch(/RLHF-resistance/);
    expect(stdout.toLowerCase()).toMatch(/adopted/);
  });

  it('marks adopted keys differently from un-adopted keys', async () => {
    await mkdir(resolve(ctx, 'procedures'), { recursive: true });
    await writeFile(resolve(ctx, 'procedures', 'cold-testing.md'), '# custom', 'utf-8');
    const { stdout } = await runCliCaptured(
      ['procedures', 'list', '--context-dir', ctx],
    );
    const coldLine = stdout.split('\n').find((l) => l.includes('cold-testing')) ?? '';
    const verifyLine = stdout.split('\n').find((l) => l.includes('verify-before-completion')) ?? '';
    expect(coldLine).not.toEqual(verifyLine);
  });

  it('--json emits a ProcedureSummary[] array', async () => {
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'list', '--json', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('available');
    expect(Array.isArray(parsed.available)).toBe(true);
    expect(parsed.available.length).toBe(6);
    expect(parsed.available[0]).toMatchObject({
      key: expect.any(String),
      adopted: expect.any(Boolean),
      path: expect.any(String),
    });
  });
});

describe('loom procedures show', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-proc-cli-show-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('prints the seed template for an un-adopted key', async () => {
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'show', 'cold-testing', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toContain('⚠ This is a seed template');
    expect(stdout).toContain('**Rule:**');
  });

  it('prints the on-disk body for an adopted key', async () => {
    await mkdir(resolve(ctx, 'procedures'), { recursive: true });
    await writeFile(
      resolve(ctx, 'procedures', 'cold-testing.md'),
      '# cold-testing\n\n**Rule:** my customized rule\n',
      'utf-8',
    );
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'show', 'cold-testing', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toContain('my customized rule');
    expect(stdout).not.toContain('⚠ This is a seed template');
  });

  it('exits 2 on an unknown key', async () => {
    const { code, stderr } = await runCliCaptured(
      ['procedures', 'show', 'does-not-exist', '--context-dir', ctx],
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/does-not-exist/);
    expect(stderr).toMatch(/Valid keys/);
  });

  it('--json emits a ProcedureDetail record', async () => {
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'show', 'cold-testing', '--json', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      key: 'cold-testing',
      adopted: false,
      template: expect.stringContaining('**Rule:**'),
    });
  });

  it('exits 2 with usage when no key is given', async () => {
    const { code, stderr } = await runCliCaptured(
      ['procedures', 'show', '--context-dir', ctx],
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/show/);
  });
});
