/**
 * loom snapshot — commit the current agent context dir to git.
 *
 * Per §14.5: auto-inits git if needed, writes canonical .gitignore,
 * stages committable files (§14.1), commits with a conventional message.
 * Does NOT commit memories.db (§14.2 / §14.3).
 */
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { writeFile, stat } from 'node:fs/promises';
import { extractGlobalFlags, resolveEnv } from './args.js';
import type { IOStreams } from './io.js';
import { renderJson } from './io.js';

const execFileAsync = promisify(execFile);

const USAGE = `Usage: loom snapshot [--message <m>] [options]

Commits the current agent context dir to git. Auto-inits git if needed
and writes a canonical .gitignore on first run. Does not commit
memories.db — episodic memory is excluded from snapshots (§14.3).

Options:
  --message, -m <str>  Commit message (default: timestamp-based)
  --json               Emit { commit, changedFiles }
  --context-dir <path> Agent context dir
  --help, -h           Show this help
`;

// Canonical .gitignore per §14.2
const CANONICAL_GITIGNORE = `memories.db
memories.db-wal
memories.db-shm
*.log
`;

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd });
}

export async function snapshot(contextDir: string, message?: string): Promise<{ commit: string | null; changedFiles: string[] }> {
  const dotGit = join(contextDir, '.git');

  // Auto-init if needed
  if (!(await fileExists(dotGit))) {
    await git(contextDir, ['init']);
  }

  // Write canonical .gitignore if not present
  const gitignorePath = join(contextDir, '.gitignore');
  if (!(await fileExists(gitignorePath))) {
    await writeFile(gitignorePath, CANONICAL_GITIGNORE, 'utf-8');
  }

  // Stage everything — .gitignore already excludes memories.db*, *.log
  await git(contextDir, ['add', '.']);

  // Check what's staged
  const { stdout: staged } = await git(contextDir, ['diff', '--cached', '--name-only']);
  const changedFiles = staged.split('\n').filter(Boolean);

  if (changedFiles.length === 0) {
    return { commit: null, changedFiles: [] };
  }

  const commitMessage = message ?? `snapshot: ${new Date().toISOString()}`;

  // Use fallback identity so snapshot works in environments without git config
  await git(contextDir, [
    '-c', 'user.name=loom',
    '-c', 'user.email=loom@local',
    'commit', '-m', commitMessage,
  ]);

  const { stdout: shaOut } = await git(contextDir, ['rev-parse', 'HEAD']);
  return { commit: shaOut.trim(), changedFiles };
}

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        message: { type: 'string', short: 'm' },
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
  const useJson = env.json;

  try {
    const result = await snapshot(env.contextDir, parsed.values.message);

    if (result.commit === null) {
      if (useJson) {
        renderJson(io, { commit: null, changedFiles: [] });
      } else {
        io.stdout('Nothing to commit.\n');
      }
      return 0;
    }

    if (useJson) {
      renderJson(io, result);
    } else {
      const shortSha = result.commit.slice(0, 8);
      const preview = result.changedFiles.slice(0, 3).join(', ');
      const more = result.changedFiles.length > 3 ? ', ...' : '';
      io.stdout(`Snapshot committed: ${shortSha}\n`);
      io.stdout(`  ${result.changedFiles.length} file(s): ${preview}${more}\n`);
    }
    return 0;
  } catch (err) {
    io.stderr(`snapshot failed: ${(err as Error).message}\n`);
    return 1;
  }
}
