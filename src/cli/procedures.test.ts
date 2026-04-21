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

describe('loom procedures adopt (flag-driven)', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-proc-cli-adopt-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('adopts a single key by positional arg', async () => {
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'adopt', 'cold-testing', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/cold-testing.*created/);
    const { readFile } = await import('node:fs/promises');
    const body = await readFile(resolve(ctx, 'procedures', 'cold-testing.md'), 'utf-8');
    expect(body).toContain('⚠ This is a seed template');
  });

  it('adopts multiple keys', async () => {
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'adopt', 'cold-testing', 'confidence-calibration', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/cold-testing.*created/);
    expect(stdout).toMatch(/confidence-calibration.*created/);
  });

  it('--all adopts every seed procedure', async () => {
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'adopt', '--all', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/verify-before-completion.*created/);
    expect(stdout).toMatch(/RLHF-resistance.*created/);
    expect(stdout.trim().split('\n')).toHaveLength(6);
  });

  it('skips-exists on re-run without --force', async () => {
    await runCliCaptured(['procedures', 'adopt', 'cold-testing', '--context-dir', ctx]);
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'adopt', 'cold-testing', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/cold-testing.*skipped-exists/);
  });

  it('--force overwrites existing adopted files', async () => {
    await runCliCaptured(['procedures', 'adopt', 'cold-testing', '--context-dir', ctx]);
    const { readFile, writeFile } = await import('node:fs/promises');
    const path = resolve(ctx, 'procedures', 'cold-testing.md');
    await writeFile(path, '# my edits\n', 'utf-8');
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'adopt', 'cold-testing', '--force', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/cold-testing.*overwritten/);
    const body = await readFile(path, 'utf-8');
    expect(body).toContain('⚠ This is a seed template');
  });

  it('exits 2 on an unknown key', async () => {
    const { code, stderr } = await runCliCaptured(
      ['procedures', 'adopt', 'not-a-real-key', '--context-dir', ctx],
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/not-a-real-key/);
  });

  it('exits 2 when --all and positional keys are both given', async () => {
    const { code, stderr } = await runCliCaptured(
      ['procedures', 'adopt', '--all', 'cold-testing', '--context-dir', ctx],
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/mutually exclusive|--all/);
  });

  it('--json emits an AdoptResult[] array', async () => {
    const { stdout, code } = await runCliCaptured(
      ['procedures', 'adopt', 'cold-testing', '--json', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({
      key: 'cold-testing',
      action: 'created',
      path: expect.any(String),
    });
  });

  it('exits 2 with usage when no keys and non-TTY stdin', async () => {
    const { code, stderr } = await runCliCaptured(
      ['procedures', 'adopt', '--context-dir', ctx],
      { stdin: '' },
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/TTY|keys/);
  });
});

describe('loom procedures adopt (TUI picker)', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-proc-cli-tui-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('picker with user selections writes only the selected keys', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('./tui/multi-select.js', async () => {
      const actual = await vi.importActual<typeof import('./tui/multi-select.js')>('./tui/multi-select.js');
      return {
        ...actual,
        multiSelect: async () => new Set(['cold-testing', 'confidence-calibration']),
      };
    });
    const { runCliCaptured: run } = await import('./test-helpers.js');
    const { code } = await run(['procedures', 'adopt', '--context-dir', ctx]);
    vi.resetModules();
    vi.doUnmock('./tui/multi-select.js');
    expect(code).toBe(0);
    const { readFile } = await import('node:fs/promises');
    await readFile(resolve(ctx, 'procedures', 'cold-testing.md'), 'utf-8');
    await readFile(resolve(ctx, 'procedures', 'confidence-calibration.md'), 'utf-8');
    const { access } = await import('node:fs/promises');
    await expect(access(resolve(ctx, 'procedures', 'cold-testing.md'))).resolves.toBeUndefined();
    await expect(access(resolve(ctx, 'procedures', 'RLHF-resistance.md')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('picker cancel (null) exits 130', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('./tui/multi-select.js', async () => {
      const actual = await vi.importActual<typeof import('./tui/multi-select.js')>('./tui/multi-select.js');
      return { ...actual, multiSelect: async () => null };
    });
    const { runCliCaptured: run } = await import('./test-helpers.js');
    const { code } = await run(['procedures', 'adopt', '--context-dir', ctx]);
    vi.resetModules();
    vi.doUnmock('./tui/multi-select.js');
    expect(code).toBe(130);
  });

  it('picker empty-selection exits 2 with message', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('./tui/multi-select.js', async () => {
      const actual = await vi.importActual<typeof import('./tui/multi-select.js')>('./tui/multi-select.js');
      return { ...actual, multiSelect: async () => new Set<string>() };
    });
    const { runCliCaptured: run } = await import('./test-helpers.js');
    const { code, stderr } = await run(['procedures', 'adopt', '--context-dir', ctx]);
    vi.resetModules();
    vi.doUnmock('./tui/multi-select.js');
    expect(code).toBe(2);
    expect(stderr).toMatch(/no procedures selected/);
  });

  it('picker only offers un-adopted keys', async () => {
    const { vi } = await import('vitest');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(resolve(ctx, 'procedures'), { recursive: true });
    await writeFile(resolve(ctx, 'procedures', 'cold-testing.md'), '# done', 'utf-8');

    vi.resetModules();
    let capturedKeys: string[] = [];
    vi.doMock('./tui/multi-select.js', async () => {
      const actual = await vi.importActual<typeof import('./tui/multi-select.js')>('./tui/multi-select.js');
      return {
        ...actual,
        multiSelect: async (opts: { items: { value: string }[] }) => {
          capturedKeys = opts.items.map((i) => i.value);
          return new Set<string>();
        },
      };
    });
    const { runCliCaptured: run } = await import('./test-helpers.js');
    await run(['procedures', 'adopt', '--context-dir', ctx]);
    vi.resetModules();
    vi.doUnmock('./tui/multi-select.js');

    expect(capturedKeys).not.toContain('cold-testing');
    expect(capturedKeys).toContain('verify-before-completion');
  });
});
