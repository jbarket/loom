import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './doctor.js';
import type { IOStreams } from './io.js';

const execFile = promisify(nodeExecFile);

function mkIo(env: Record<string, string>): { io: IOStreams; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const io: IOStreams = {
    stdin: process.stdin,
    stdinIsTTY: false,
    stdout: (s) => { out.push(s); },
    stderr: (s) => { err.push(s); },
    env,
  };
  return { io, out, err };
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFile('git', ['-C', cwd, ...args]);
}

async function initRepo(dir: string): Promise<void> {
  await git(dir, ['init', '-q']);
  await git(dir, ['config', 'user.name', 'test']);
  await git(dir, ['config', 'user.email', 'test@localhost']);
}

describe('loom doctor', () => {
  let work: string;
  beforeEach(async () => { work = await mkdtemp(join(tmpdir(), 'loom-doctor-')); });
  afterEach(async () => { await rm(work, { recursive: true, force: true }); });

  it('reports empty existingAgents in a fresh HOME', async () => {
    const { io, out } = mkIo({ HOME: work });
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.existingAgents).toEqual([]);
    expect(typeof parsed.nodeOk).toBe('boolean');
    expect(parsed.nodeOk).toBe(true);
    expect(parsed.stackVersionOk).toBe(true);
  });

  it('discovers agents under ~/.config/loom/*', async () => {
    const artDir = join(work, '.config', 'loom', 'art');
    await mkdir(join(artDir, 'procedures'), { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await writeFile(join(artDir, 'procedures', 'cold-testing.md'), '# x\n', 'utf-8');

    const { io, out } = mkIo({ HOME: work });
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.existingAgents).toHaveLength(1);
    const [art] = parsed.existingAgents;
    expect(art.name).toBe('art');
    expect(art.hasIdentity).toBe(true);
    expect(art.hasMemoriesDb).toBe(false);
    expect(art.hasProcedures).toBe(true);
    expect(art.git.initialized).toBe(false);
    expect(art.git.hasRemote).toBe(false);
    expect(art.git.dirty).toBe(false);
    expect(art.git.gitignorePresent).toBe(false);
  });

  it('reports git.initialized=true when a .git dir is present', async () => {
    const artDir = join(work, '.config', 'loom', 'art');
    await mkdir(join(artDir, '.git'), { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await writeFile(join(artDir, '.gitignore'), 'memories.db\n', 'utf-8');

    const { io, out } = mkIo({ HOME: work });
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.existingAgents[0].git.initialized).toBe(true);
    expect(parsed.existingAgents[0].git.gitignorePresent).toBe(true);
  });

  it('human-readable output lists each agent on its own line', async () => {
    const artDir = join(work, '.config', 'loom', 'art');
    await mkdir(artDir, { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');

    const { io, out } = mkIo({ HOME: work });
    const code = await run([], io);
    expect(code).toBe(0);
    const joined = out.join('');
    expect(joined).toMatch(/art/);
    expect(joined).toMatch(/node/i);
  });

  // ── Real git state tests (SLE-27) ──────────────────────────────────────────

  it('git state: initialized=true, hasRemote=false, dirty=false — clean repo', async () => {
    const artDir = join(work, '.config', 'loom', 'art');
    await mkdir(artDir, { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await initRepo(artDir);
    await git(artDir, ['add', '--all']);
    await git(artDir, ['commit', '-m', 'init']);

    const { io, out } = mkIo({ HOME: work });
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    const gitState = parsed.existingAgents[0].git;
    expect(gitState.initialized).toBe(true);
    expect(gitState.hasRemote).toBe(false);
    expect(gitState.dirty).toBe(false);
  });

  it('git state: dirty=true — repo with uncommitted changes', async () => {
    const artDir = join(work, '.config', 'loom', 'art');
    await mkdir(artDir, { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await initRepo(artDir);
    await git(artDir, ['add', '--all']);
    await git(artDir, ['commit', '-m', 'init']);
    // Add an untracked file to make it dirty
    await writeFile(join(artDir, 'new-file.md'), '# New\n', 'utf-8');

    const { io, out } = mkIo({ HOME: work });
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    const gitState = parsed.existingAgents[0].git;
    expect(gitState.initialized).toBe(true);
    expect(gitState.dirty).toBe(true);
  });

  it('git state: hasRemote=true — repo with a configured remote', async () => {
    // Create a bare "remote" repo in a temp location
    const remoteDir = join(work, 'fake-remote');
    await mkdir(remoteDir, { recursive: true });
    await git(remoteDir, ['init', '--bare', '-q']);

    const artDir = join(work, '.config', 'loom', 'art');
    await mkdir(artDir, { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');
    await initRepo(artDir);
    await git(artDir, ['add', '--all']);
    await git(artDir, ['commit', '-m', 'init']);
    await git(artDir, ['remote', 'add', 'origin', remoteDir]);

    const { io, out } = mkIo({ HOME: work });
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    const gitState = parsed.existingAgents[0].git;
    expect(gitState.initialized).toBe(true);
    expect(gitState.hasRemote).toBe(true);
    expect(gitState.dirty).toBe(false);
  });

  it('git state: initialized=false — no .git directory', async () => {
    const artDir = join(work, '.config', 'loom', 'art');
    await mkdir(artDir, { recursive: true });
    await writeFile(join(artDir, 'IDENTITY.md'), '# Art\n', 'utf-8');

    const { io, out } = mkIo({ HOME: work });
    const code = await run(['--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    const gitState = parsed.existingAgents[0].git;
    expect(gitState.initialized).toBe(false);
    expect(gitState.hasRemote).toBe(false);
    expect(gitState.dirty).toBe(false);
  });
});
