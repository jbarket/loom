/**
 * loom doctor — read-only environment probe. Reports node version
 * compatibility, stack version, existing agents under
 * ~/.config/loom/*, and forward-looking git fields per agent. Never
 * writes. Exit 0 regardless of findings; health is the output, not
 * the exit code.
 */
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { extractGlobalFlags } from './args.js';
import type { IOStreams } from './io.js';
import { renderJson } from './io.js';

const execFileAsync = promisify(execFile);

const USAGE = `Usage: loom doctor [options]

Probes the loom environment. Read-only; exits 0 regardless of findings.

Options:
  --json    Machine-readable output
  --help    Show this help
`;

interface GitState {
  initialized: boolean;
  hasRemote: boolean;
  dirty: boolean;
  gitignorePresent: boolean;
}

interface AgentReport {
  name: string;
  path: string;
  hasIdentity: boolean;
  hasMemoriesDb: boolean;
  hasProcedures: boolean;
  git: GitState;
}

interface DoctorReport {
  nodeOk: boolean;
  nodeVersion: string;
  stackVersionOk: boolean;
  contextDirResolved: string;
  agentsRoot: string;
  existingAgents: AgentReport[];
}

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function dirNonEmpty(p: string): Promise<boolean> {
  try {
    const entries = await readdir(p);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function probeGit(agentDir: string): Promise<GitState> {
  const dotGit = join(agentDir, '.git');
  const initialized = await fileExists(dotGit);
  const gitignorePresent = await fileExists(join(agentDir, '.gitignore'));

  if (!initialized) {
    return { initialized, hasRemote: false, dirty: false, gitignorePresent };
  }

  let hasRemote = false;
  try {
    const { stdout } = await execFileAsync('git', ['remote'], { cwd: agentDir });
    hasRemote = stdout.trim().length > 0;
  } catch { /* best effort */ }

  let dirty = false;
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: agentDir });
    dirty = stdout.trim().length > 0;
  } catch { /* best effort */ }

  return { initialized, hasRemote, dirty, gitignorePresent };
}

async function probeAgents(home: string): Promise<{ root: string; agents: AgentReport[] }> {
  const root = join(home, '.config', 'loom');
  const agents: AgentReport[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return { root, agents };
  }
  for (const name of entries.sort()) {
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

function nodeOk(version: string): boolean {
  const m = version.match(/^v(\d+)\./);
  return m !== null && Number(m[1]) >= 20;
}

async function probeStackVersion(contextDir: string): Promise<boolean> {
  const file = join(contextDir, 'LOOM_STACK_VERSION');
  try {
    const body = (await readFile(file, 'utf-8')).trim();
    const v = Number(body);
    return Number.isInteger(v) && v <= 1;
  } catch {
    return true;
  }
}

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  if (parsed.values.help) { io.stdout(USAGE); return 0; }

  const home = io.env.HOME ?? process.env.HOME ?? '';
  const contextDir = global.contextDir ?? io.env.LOOM_CONTEXT_DIR ?? join(home, '.config', 'loom', 'default');
  const { root, agents } = await probeAgents(home);

  const report: DoctorReport = {
    nodeOk: nodeOk(process.version),
    nodeVersion: process.version,
    stackVersionOk: await probeStackVersion(contextDir),
    contextDirResolved: contextDir,
    agentsRoot: root,
    existingAgents: agents,
  };

  const json = Boolean(parsed.values.json) || Boolean(global.json);
  if (json) {
    renderJson(io, report);
    return 0;
  }

  const lines: string[] = [];
  lines.push(`node:        ${report.nodeVersion}${report.nodeOk ? '' : '  (unsupported — need ≥ 20)'}`);
  lines.push(`stack:       ${report.stackVersionOk ? 'compatible' : 'incompatible'}`);
  lines.push(`context dir: ${report.contextDirResolved}`);
  lines.push(`agents root: ${report.agentsRoot}`);
  if (report.existingAgents.length === 0) {
    lines.push('agents:      (none)');
  } else {
    lines.push(`agents:      ${report.existingAgents.length}`);
    for (const a of report.existingAgents) {
      const flags: string[] = [];
      if (a.hasIdentity) flags.push('identity');
      if (a.hasMemoriesDb) flags.push('memories.db');
      if (a.hasProcedures) flags.push('procedures');
      if (a.git.initialized) flags.push('git');
      lines.push(`  - ${a.name} (${flags.join(', ') || 'empty'})`);
    }
  }
  io.stdout(lines.join('\n') + '\n');
  return 0;
}
