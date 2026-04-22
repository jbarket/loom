/**
 * loom doctor — read-only environment probe. Reports node version
 * compatibility, stack version, existing agents under
 * ~/.config/loom/*, and forward-looking git fields per agent. Never
 * writes. Exit 0 regardless of findings; health is the output, not
 * the exit code.
 */
import { parseArgs } from 'node:util';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { extractGlobalFlags } from './args.js';
import type { IOStreams } from './io.js';
import { renderJson } from './io.js';
import { resolveFastEmbedModel, resolveFastEmbedCacheDir } from '../config.js';
import { isModelCached, FastEmbedProvider } from '../backends/fastembed.js';

const USAGE = `Usage: loom doctor [options]

Probes the loom environment. Read-only by default; exits 0 regardless of findings.

Options:
  --warm    Download the embedding model if not already cached (writes to cache)
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

interface EmbedReport {
  model: string;
  cacheDir: string;
  cached: boolean;
  cacheEnvSet: boolean;
}

interface DoctorReport {
  nodeOk: boolean;
  nodeVersion: string;
  stackVersionOk: boolean;
  contextDirResolved: string;
  agentsRoot: string;
  existingAgents: AgentReport[];
  embed: EmbedReport;
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
  return {
    initialized,
    hasRemote: false,
    dirty: false,
    gitignorePresent,
  };
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

function probeEmbed(): EmbedReport {
  const model = resolveFastEmbedModel();
  const envCacheDir = resolveFastEmbedCacheDir();
  const cacheDir = envCacheDir ?? join(homedir(), '.cache', 'loom', 'fastembed');
  return {
    model,
    cacheDir,
    cached: isModelCached(cacheDir, model),
    cacheEnvSet: Boolean(envCacheDir),
  };
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
        warm: { type: 'boolean' },
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
  const embed = probeEmbed();

  // --warm: download the embedding model now if not yet cached.
  if (parsed.values.warm && !embed.cached) {
    io.stderr(`Warming embedding model cache (${embed.model})...\n`);
    const provider = new FastEmbedProvider({ model: embed.model, cacheDir: embed.cacheDir });
    try {
      await provider.warmUp();
      // Refresh cached status after warm-up.
      embed.cached = isModelCached(embed.cacheDir, embed.model);
      io.stderr('Embedding model cached.\n');
    } catch (err) {
      io.stderr(`Warm-up failed: ${(err as Error).message}\n`);
    }
  } else if (parsed.values.warm && embed.cached) {
    io.stderr(`Embedding model already cached (${embed.model}).\n`);
  }

  const report: DoctorReport = {
    nodeOk: nodeOk(process.version),
    nodeVersion: process.version,
    stackVersionOk: await probeStackVersion(contextDir),
    contextDirResolved: contextDir,
    agentsRoot: root,
    existingAgents: agents,
    embed,
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
  const embedCacheNote = report.embed.cacheEnvSet ? ` (LOOM_FASTEMBED_CACHE_DIR)` : '';
  const embedStatus = report.embed.cached ? 'cached' : 'not cached  (run with --warm to download)';
  lines.push(`embed model: ${report.embed.model}  [${embedStatus}]`);
  lines.push(`embed cache: ${report.embed.cacheDir}${embedCacheNote}`);
  io.stdout(lines.join('\n') + '\n');
  return 0;
}
