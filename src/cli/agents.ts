/**
 * loom agents — enumerate agents and manage the active-agent pointer.
 *
 * Subcommands:
 *   list          Print all agents under ~/.config/loom/
 *   current       Print the active pointer (name + resolved path)
 *   switch <name> Rewrite ~/.config/loom/current to point at <name>
 *
 * The pointer file (~/.config/loom/current) contains the agent name as
 * plain text. Resolution order for context dir:
 *   1. LOOM_CONTEXT_DIR env / --context-dir flag
 *   2. ~/.config/loom/current  →  ~/.config/loom/<name>
 *   3. ~/.config/loom/default
 */
import { parseArgs } from 'node:util';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { extractGlobalFlags } from './args.js';
import { renderJson } from './io.js';
import type { IOStreams } from './io.js';

const USAGE = `Usage: loom agents <subcommand> [options]

Subcommands:
  list             List all agents under ~/.config/loom/
  current          Print the active agent pointer
  switch <name>    Set <name> as the active agent

Options:
  --json           Machine-readable output
  --help, -h       Show this help
`;

// ─── Shared agent probe (also used by loom doctor) ──────────────────────────

export interface GitState {
  initialized: boolean;
  hasRemote: boolean;
  dirty: boolean;
  gitignorePresent: boolean;
}

export interface AgentReport {
  name: string;
  path: string;
  hasIdentity: boolean;
  hasMemoriesDb: boolean;
  hasProcedures: boolean;
  git: GitState;
}

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function dirNonEmpty(p: string): Promise<boolean> {
  try { return (await readdir(p)).length > 0; }
  catch { return false; }
}

async function probeGit(agentDir: string): Promise<GitState> {
  return {
    initialized: await fileExists(join(agentDir, '.git')),
    hasRemote: false,
    dirty: false,
    gitignorePresent: await fileExists(join(agentDir, '.gitignore')),
  };
}

export async function probeAgents(
  home: string,
): Promise<{ root: string; agents: AgentReport[] }> {
  const root = join(home, '.config', 'loom');
  const agents: AgentReport[] = [];
  let entries: string[] = [];
  try { entries = await readdir(root); }
  catch { return { root, agents }; }

  for (const name of entries.sort()) {
    if (name === CURRENT_POINTER_FILENAME) continue;
    const p = join(root, name);
    let s;
    try { s = await stat(p); } catch { continue; }
    if (!s.isDirectory()) continue;
    agents.push({
      name,
      path: p,
      hasIdentity: await fileExists(join(p, 'IDENTITY.md')),
      hasMemoriesDb: await fileExists(join(p, 'memories.db')),
      hasProcedures: await dirNonEmpty(join(p, 'procedures')),
      git: await probeGit(p),
    });
  }
  return { root, agents };
}

// ─── Pointer helpers ─────────────────────────────────────────────────────────

export const CURRENT_POINTER_FILENAME = 'current';

export function pointerFilePath(home: string): string {
  return join(home, '.config', 'loom', CURRENT_POINTER_FILENAME);
}

export async function readCurrentPointer(home: string): Promise<string | null> {
  try {
    const name = (await readFile(pointerFilePath(home), 'utf-8')).trim();
    return isValidAgentName(name) ? name : null;
  } catch {
    return null;
  }
}

export async function writeCurrentPointer(home: string, name: string): Promise<void> {
  await writeFile(pointerFilePath(home), name + '\n', 'utf-8');
}

export function isValidAgentName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    name !== CURRENT_POINTER_FILENAME
  );
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  const sub = rest[0];
  const subRest = rest.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    io.stdout(USAGE);
    return sub ? 0 : 2;
  }
  if (!['list', 'current', 'switch'].includes(sub)) {
    io.stderr(`Unknown agents subcommand: ${sub}\n${USAGE}`);
    return 2;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: subRest,
      options: { help: { type: 'boolean', short: 'h' } },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  if (parsed.values.help) { io.stdout(USAGE); return 0; }

  const json = Boolean(global.json);
  const home = io.env.HOME ?? homedir();

  if (sub === 'list') {
    const { root, agents } = await probeAgents(home);
    if (json) { renderJson(io, { root, agents }); return 0; }
    if (agents.length === 0) {
      io.stdout(`No agents found under ${root}\n`);
      return 0;
    }
    for (const a of agents) {
      const flags: string[] = [];
      if (a.hasIdentity) flags.push('identity');
      if (a.hasMemoriesDb) flags.push('memories.db');
      if (a.hasProcedures) flags.push('procedures');
      if (a.git.initialized) flags.push('git');
      io.stdout(`${a.name}  ${a.path}  (${flags.join(', ') || 'empty'})\n`);
    }
    return 0;
  }

  if (sub === 'current') {
    const name = await readCurrentPointer(home);
    if (name === null) {
      if (json) { renderJson(io, { pointer: null, path: null }); return 0; }
      io.stdout('(no current pointer set — defaulting to "default")\n');
      return 0;
    }
    const path = join(home, '.config', 'loom', name);
    if (json) { renderJson(io, { pointer: name, path }); return 0; }
    io.stdout(`${name}  →  ${path}\n`);
    return 0;
  }

  // sub === 'switch'
  const name = parsed.positionals[0];
  if (!name) {
    io.stderr('loom agents switch: <name> required\n');
    return 2;
  }
  if (!isValidAgentName(name)) {
    io.stderr(`loom agents switch: invalid agent name "${name}"\n`);
    return 2;
  }
  await writeCurrentPointer(home, name);
  if (json) {
    renderJson(io, { pointer: name, path: join(home, '.config', 'loom', name) });
    return 0;
  }
  io.stdout(`Switched to agent: ${name}\n`);
  return 0;
}
