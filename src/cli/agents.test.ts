import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';
import { run } from './agents.js';
import type { IOStreams } from './io.js';

function mkIo(home: string): { io: IOStreams; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const io: IOStreams = {
    stdin: process.stdin,
    stdinIsTTY: false,
    stdout: (s) => { out.push(s); },
    stderr: (s) => { err.push(s); },
    env: { HOME: home },
  };
  return { io, out, err };
}

describe('loom agents list', () => {
  let home: string;
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'loom-agents-')); });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it('reports no agents in a fresh HOME', async () => {
    const { io, out } = mkIo(home);
    const code = await run(['list', '--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.agents).toEqual([]);
    expect(typeof parsed.root).toBe('string');
  });

  it('discovers agents under ~/.config/loom/*', async () => {
    const artDir = join(home, '.config', 'loom', 'art');
    await mkdir(join(artDir, 'procedures'), { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await writeFile(join(artDir, 'procedures', 'cold-testing.md'), '# x\n', 'utf-8');

    const { io, out } = mkIo(home);
    const code = await run(['list', '--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.agents).toHaveLength(1);
    const [art] = parsed.agents;
    expect(art.name).toBe('art');
    expect(art.hasIdentity).toBe(true);
    expect(art.hasProcedures).toBe(true);
  });

  it('skips the "current" pointer file when listing agents', async () => {
    const loomRoot = join(home, '.config', 'loom');
    await mkdir(join(loomRoot, 'art'), { recursive: true });
    await writeFile(join(loomRoot, 'art', 'IDENTITY.md'), '# Art\n', 'utf-8');
    await writeFile(join(loomRoot, 'current'), 'art\n', 'utf-8');

    const { io, out } = mkIo(home);
    const code = await run(['list', '--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.agents.map((a: { name: string }) => a.name)).not.toContain('current');
    expect(parsed.agents).toHaveLength(1);
  });

  it('human-readable list includes agent name and path', async () => {
    const artDir = join(home, '.config', 'loom', 'art');
    await mkdir(artDir, { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');

    const { io, out } = mkIo(home);
    const code = await run(['list'], io);
    expect(code).toBe(0);
    const joined = out.join('');
    expect(joined).toMatch(/art/);
    expect(joined).toMatch(/identity/);
  });
});

describe('loom agents current', () => {
  let home: string;
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'loom-agents-')); });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it('returns null pointer when file is absent', async () => {
    const { io, out } = mkIo(home);
    const code = await run(['current', '--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.pointer).toBeNull();
    expect(parsed.path).toBeNull();
  });

  it('returns pointer name and resolved path when file exists', async () => {
    const loomRoot = join(home, '.config', 'loom');
    await mkdir(loomRoot, { recursive: true });
    await writeFile(join(loomRoot, 'current'), 'art\n', 'utf-8');

    const { io, out } = mkIo(home);
    const code = await run(['current', '--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.pointer).toBe('art');
    expect(parsed.path).toContain('art');
  });

  it('human-readable output shows name and arrow', async () => {
    const loomRoot = join(home, '.config', 'loom');
    await mkdir(loomRoot, { recursive: true });
    await writeFile(join(loomRoot, 'current'), 'art\n', 'utf-8');

    const { io, out } = mkIo(home);
    const code = await run(['current'], io);
    expect(code).toBe(0);
    expect(out.join('')).toMatch(/art.*→/);
  });

  it('human-readable output notes no pointer when absent', async () => {
    const { io, out } = mkIo(home);
    const code = await run(['current'], io);
    expect(code).toBe(0);
    expect(out.join('')).toMatch(/no current pointer/i);
  });
});

describe('loom agents switch', () => {
  let home: string;
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'loom-agents-')); });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it('writes the pointer file and exits 0', async () => {
    const loomRoot = join(home, '.config', 'loom');
    await mkdir(loomRoot, { recursive: true });

    const { io, out } = mkIo(home);
    const code = await run(['switch', 'art'], io);
    expect(code).toBe(0);
    expect(out.join('')).toMatch(/art/);

    const written = (await readFile(join(loomRoot, 'current'), 'utf-8')).trim();
    expect(written).toBe('art');
  });

  it('overwrites an existing pointer', async () => {
    const loomRoot = join(home, '.config', 'loom');
    await mkdir(loomRoot, { recursive: true });
    await writeFile(join(loomRoot, 'current'), 'old-agent\n', 'utf-8');

    const { io } = mkIo(home);
    await run(['switch', 'art'], io);

    const written = (await readFile(join(loomRoot, 'current'), 'utf-8')).trim();
    expect(written).toBe('art');
  });

  it('--json emits pointer and path', async () => {
    const loomRoot = join(home, '.config', 'loom');
    await mkdir(loomRoot, { recursive: true });

    const { io, out } = mkIo(home);
    const code = await run(['switch', 'art', '--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.pointer).toBe('art');
    expect(parsed.path).toContain('art');
  });

  it('exits 2 when no name is given', async () => {
    const { io, err } = mkIo(home);
    const code = await run(['switch'], io);
    expect(code).toBe(2);
    expect(err.join('')).toMatch(/required/);
  });

  it('exits 2 for a name with path separators', async () => {
    const { io, err } = mkIo(home);
    const code = await run(['switch', 'foo/bar'], io);
    expect(code).toBe(2);
    expect(err.join('')).toMatch(/invalid/);
  });

  it('exits 2 for the reserved name "current"', async () => {
    const { io, err } = mkIo(home);
    const code = await run(['switch', 'current'], io);
    expect(code).toBe(2);
    expect(err.join('')).toMatch(/invalid/);
  });
});

describe('loom agents — pointer drives context-dir resolution', () => {
  let home: string;
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'loom-agents-')); });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it('resolveEnv picks up the pointer when LOOM_CONTEXT_DIR is absent', async () => {
    const loomRoot = join(home, '.config', 'loom');
    await mkdir(loomRoot, { recursive: true });
    await writeFile(join(loomRoot, 'current'), 'art\n', 'utf-8');

    // Use runCliCaptured with an env that has HOME set (no LOOM_CONTEXT_DIR)
    const { stdout, code } = await runCliCaptured(
      ['agents', 'current', '--json'],
      { env: { HOME: home } },
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.pointer).toBe('art');
  });
});

describe('loom agents — dispatch via runCli', () => {
  it('routes to agents.run', async () => {
    const { stdout, code } = await runCliCaptured(['agents', '--help']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/loom agents/);
  });

  it('exits 2 for unknown subcommand', async () => {
    const { code, stderr } = await runCliCaptured(['agents', 'nope']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/Unknown agents subcommand/);
  });
});
