/**
 * loom snapshot — git-backed commit of the agent context dir.
 *
 * On first call:
 *   - initializes a git repo if one doesn't exist
 *   - writes a canonical .gitignore (excludes memories.db and WAL files)
 *
 * Commits all stageable files (respects .gitignore), then returns
 * the short commit hash and list of changed files.
 *
 * memories.db is intentionally excluded — use loom memory export/import
 * for episodic memory backup (see SLE-26).
 */
import { parseArgs } from 'node:util';
import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractGlobalFlags, resolveEnv } from './args.js';
import type { IOStreams } from './io.js';
import { renderJson } from './io.js';

const execFile = promisify(nodeExecFile);

const USAGE = `Usage: loom snapshot [options]

Commits the agent context directory to git. Auto-initializes on first use.
Excludes memories.db (use loom memory export for episodic memory backup).

Options:
  --message, -m <text>   Commit message (default: timestamp)
  --json                 Emit { commit, changedFiles }
  --context-dir <path>   Agent context dir
  --help, -h             Show this help
`;

const GITIGNORE_BODY = `# loom — episodic memory (managed separately via export/import)
memories.db
memories.db-shm
memories.db-wal

# Logs
*.log
`;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFile('git', ['-C', cwd, ...args], { encoding: 'utf-8' });
  return stdout;
}

async function ensureRepo(contextDir: string): Promise<void> {
  if (!existsSync(join(contextDir, '.git'))) {
    await git(contextDir, ['init', '-q']);
    await git(contextDir, ['config', 'user.name', 'loom']);
    await git(contextDir, ['config', 'user.email', 'loom@localhost']);
  }
}

function ensureGitignore(contextDir: string): void {
  const path = join(contextDir, '.gitignore');
  if (!existsSync(path)) {
    writeFileSync(path, GITIGNORE_BODY, 'utf-8');
  }
}

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        message: { type: 'string', short: 'm' },
        json:    { type: 'boolean' },
        help:    { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  if (parsed.values.help) { io.stdout(USAGE); return 0; }

  const env = resolveEnv(global, io.env);
  const contextDir = env.contextDir;
  const json = Boolean(parsed.values.json) || env.json;

  try {
    await ensureRepo(contextDir);
    ensureGitignore(contextDir);

    await git(contextDir, ['add', '--all']);

    const stagedRaw = (await git(contextDir, ['diff', '--cached', '--name-only'])).trim();
    const changedFiles = stagedRaw ? stagedRaw.split('\n') : [];

    if (changedFiles.length === 0) {
      if (json) {
        renderJson(io, { commit: null, changedFiles: [] });
      } else {
        io.stdout('Nothing to commit.\n');
      }
      return 0;
    }

    const message = parsed.values.message ??
      `snapshot: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`;

    await git(contextDir, ['commit', '--message', message]);

    const commit = (await git(contextDir, ['rev-parse', 'HEAD'])).trim().slice(0, 8);
    const n = changedFiles.length;

    if (json) {
      renderJson(io, { commit, changedFiles });
    } else {
      io.stdout(`Snapshot ${commit} — ${n} file${n === 1 ? '' : 's'} committed.\n`);
    }
    return 0;
  } catch (err) {
    io.stderr(`snapshot failed: ${(err as Error).message}\n`);
    return 1;
  }
}
