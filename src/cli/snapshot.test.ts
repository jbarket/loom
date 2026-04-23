import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

describe('loom snapshot', () => {
  let ctx: string;

  beforeEach(async () => {
    ctx = await mkdtemp(join(tmpdir(), 'loom-snapshot-'));
  });
  afterEach(async () => {
    await rm(ctx, { recursive: true, force: true });
  });

  it('auto-inits git and commits on first run', async () => {
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art\n', 'utf-8');

    const { code, stdout } = await runCliCaptured(
      ['snapshot', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/Snapshot committed:/);

    const log = await git(ctx, ['log', '--oneline']);
    expect(log).toMatch(/snapshot:/);
  });

  it('writes canonical .gitignore on first run', async () => {
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art\n', 'utf-8');

    await runCliCaptured(['snapshot', '--context-dir', ctx]);

    const gitignore = await readFile(join(ctx, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('memories.db');
    expect(gitignore).toContain('memories.db-wal');
    expect(gitignore).toContain('memories.db-shm');
    expect(gitignore).toContain('*.log');
  });

  it('does not commit memories.db', async () => {
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await writeFile(join(ctx, 'memories.db'), 'fake db', 'utf-8');

    await runCliCaptured(['snapshot', '--context-dir', ctx]);

    const tracked = await git(ctx, ['ls-files']);
    expect(tracked).not.toContain('memories.db');
    expect(tracked).toContain('IDENTITY.md');
  });

  it('uses custom --message when provided', async () => {
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art\n', 'utf-8');

    await runCliCaptured([
      'snapshot', '--message', 'my custom message', '--context-dir', ctx,
    ]);

    const log = await git(ctx, ['log', '--format=%s']);
    expect(log).toBe('my custom message');
  });

  it('emits JSON with commit sha and changedFiles on --json', async () => {
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art\n', 'utf-8');

    const { code, stdout } = await runCliCaptured(
      ['snapshot', '--json', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(typeof parsed.commit).toBe('string');
    expect(parsed.commit).toHaveLength(40);
    expect(Array.isArray(parsed.changedFiles)).toBe(true);
    expect(parsed.changedFiles.length).toBeGreaterThan(0);
  });

  it('reports nothing-to-commit on a clean repo', async () => {
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art\n', 'utf-8');

    // First snapshot — creates commit
    await runCliCaptured(['snapshot', '--context-dir', ctx]);

    // Second snapshot — nothing changed
    const { code, stdout } = await runCliCaptured(
      ['snapshot', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    expect(stdout).toContain('Nothing to commit');
  });

  it('emits { commit: null, changedFiles: [] } on --json when nothing to commit', async () => {
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await runCliCaptured(['snapshot', '--context-dir', ctx]);

    const { code, stdout } = await runCliCaptured(
      ['snapshot', '--json', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.commit).toBeNull();
    expect(parsed.changedFiles).toEqual([]);
  });

  it('picks up changes on a subsequent snapshot', async () => {
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await runCliCaptured(['snapshot', '--context-dir', ctx]);

    // Modify a file
    await writeFile(join(ctx, 'IDENTITY.md'), '# Art v2\n', 'utf-8');

    const { code, stdout } = await runCliCaptured(
      ['snapshot', '--json', '--context-dir', ctx],
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.commit).not.toBeNull();
    expect(parsed.changedFiles).toContain('IDENTITY.md');
  });
});
