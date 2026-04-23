import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './snapshot.js';
import type { IOStreams } from './io.js';

function mkIo(contextDir: string): { io: IOStreams; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const io: IOStreams = {
    stdin: process.stdin,
    stdinIsTTY: false,
    stdout: (s) => { out.push(s); },
    stderr: (s) => { err.push(s); },
    env: { LOOM_CONTEXT_DIR: contextDir },
  };
  return { io, out, err };
}

describe('loom snapshot', () => {
  let contextDir: string;

  beforeEach(async () => {
    contextDir = await mkdtemp(join(tmpdir(), 'loom-snapshot-'));
  });

  afterEach(async () => {
    await rm(contextDir, { recursive: true, force: true });
  });

  it('initializes a git repo and commits on first use', async () => {
    await writeFile(join(contextDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8');
    const { io, out } = mkIo(contextDir);
    const code = await run([], io);
    expect(code).toBe(0);
    expect(out.join('')).toMatch(/Snapshot [0-9a-f]{8}/);
    expect(out.join('')).toContain('file');
    expect(existsSync(join(contextDir, '.git'))).toBe(true);
  });

  it('writes .gitignore on first use', async () => {
    await writeFile(join(contextDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8');
    const { io } = mkIo(contextDir);
    await run([], io);
    expect(existsSync(join(contextDir, '.gitignore'))).toBe(true);
  });

  it('emits JSON with commit hash and changedFiles', async () => {
    await writeFile(join(contextDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8');
    const { io, out } = mkIo(contextDir);
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const result = JSON.parse(out.join(''));
    expect(typeof result.commit).toBe('string');
    expect(result.changedFiles).toContain('IDENTITY.md');
  });

  it('accepts a custom commit message', async () => {
    await writeFile(join(contextDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8');
    const { io, out } = mkIo(contextDir);
    const code = await run(['-m', 'my custom message'], io);
    expect(code).toBe(0);
    expect(out.join('')).toMatch(/Snapshot [0-9a-f]{8}/);
  });

  it('reports nothing-to-commit when no files changed', async () => {
    await writeFile(join(contextDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8');
    const { io: io1 } = mkIo(contextDir);
    await run([], io1);

    const { io, out } = mkIo(contextDir);
    const code = await run([], io);
    expect(code).toBe(0);
    expect(out.join('')).toContain('Nothing to commit');
  });

  it('emits JSON with null commit when nothing to commit', async () => {
    await writeFile(join(contextDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8');
    const { io: io1 } = mkIo(contextDir);
    await run([], io1);

    const { io, out } = mkIo(contextDir);
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const result = JSON.parse(out.join(''));
    expect(result.commit).toBeNull();
    expect(result.changedFiles).toEqual([]);
  });

  it('excludes memories.db from commits', async () => {
    await writeFile(join(contextDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8');
    await writeFile(join(contextDir, 'memories.db'), 'binary data', 'utf-8');
    const { io, out } = mkIo(contextDir);
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const result = JSON.parse(out.join(''));
    expect(result.changedFiles).not.toContain('memories.db');
    expect(result.changedFiles).toContain('IDENTITY.md');
  });

  it('prints help and exits 0', async () => {
    const { io, out } = mkIo(contextDir);
    const code = await run(['--help'], io);
    expect(code).toBe(0);
    expect(out.join('')).toMatch(/Usage: loom snapshot/);
  });
});
