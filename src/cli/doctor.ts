/**
 * loom doctor — read-only environment probe. Reports node version
 * compatibility, stack version, existing agents under
 * ~/.config/loom/*, the active-agent pointer, and forward-looking
 * git fields per agent. Never writes. Exit 0 regardless of findings;
 * health is the output, not the exit code.
 */
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { extractGlobalFlags, resolveEnv } from './args.js';
import type { IOStreams } from './io.js';
import { renderJson } from './io.js';
import { probeAgents, readCurrentPointer } from './agents.js';
import type { AgentReport } from './agents.js';

export type { AgentReport };

const USAGE = `Usage: loom doctor [options]

Probes the loom environment. Read-only; exits 0 regardless of findings.

Options:
  --json    Machine-readable output
  --help    Show this help
`;

interface DoctorReport {
  nodeOk: boolean;
  nodeVersion: string;
  stackVersionOk: boolean;
  contextDirResolved: string;
  agentsRoot: string;
  currentPointer: string | null;
  existingAgents: AgentReport[];
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

  const home = io.env.HOME ?? process.env.HOME ?? homedir();
  const env = resolveEnv(global, io.env);
  const { root, agents } = await probeAgents(home);
  const currentPointer = await readCurrentPointer(home);

  const report: DoctorReport = {
    nodeOk: nodeOk(process.version),
    nodeVersion: process.version,
    stackVersionOk: await probeStackVersion(env.contextDir),
    contextDirResolved: env.contextDir,
    agentsRoot: root,
    currentPointer,
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
  lines.push(`pointer:     ${report.currentPointer ?? '(none — using "default")'}`);
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
