/**
 * loom procedures — list, show, adopt.
 *
 * Read-only commands (list, show) and the write command (adopt — flag-driven
 * and TTY-wizard) for procedural-identity seed templates. Shares core logic
 * with the MCP surface via src/blocks/procedures.ts.
 */
import { parseArgs } from 'node:util';
import { assertStackVersionCompatible } from '../config.js';
import { extractGlobalFlags, resolveEnv } from './args.js';
import { renderJson } from './io.js';
import type { IOStreams } from './io.js';
import {
  adoptProcedures,
  listProcedures,
  showProcedure,
  UnknownProcedureError,
} from '../blocks/procedures.js';

const USAGE = `Usage: loom procedures <subcommand> [options]

Subcommands:
  list             Show available seed procedures and adoption state
  show <key>       Print template (or adopted body) for one procedure
  adopt [<keys>]   Adopt one or more procedures (TUI picker when no keys)

Options (list):
  --json           Emit { available: ProcedureSummary[] } as JSON

Options (show):
  --json           Emit ProcedureDetail as JSON

Options (adopt):
  --all            Adopt every un-adopted seed
  --force          Overwrite existing adopted files
  --json           Emit AdoptResult[] as JSON

Global: --context-dir, --json, --help
`;

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  const sub = rest[0];
  const subRest = rest.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    io.stdout(USAGE);
    return sub ? 0 : 2;
  }
  if (sub !== 'list' && sub !== 'show' && sub !== 'adopt') {
    io.stderr(`Unknown procedures subcommand: ${sub}\n${USAGE}`);
    return 2;
  }

  const env = resolveEnv(global, io.env);
  try { assertStackVersionCompatible(env.contextDir); }
  catch (err) { io.stderr(`${(err as Error).message}\n`); return 1; }

  if (sub === 'list') return runList(env, subRest, io);
  if (sub === 'show') return runShow(env, subRest, io);
  return runAdopt(env, subRest, io);
}

async function runList(
  env: ReturnType<typeof resolveEnv>,
  subRest: string[],
  io: IOStreams,
): Promise<number> {
  try {
    parseArgs({ args: subRest, options: {}, strict: true, allowPositionals: false });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const result = await listProcedures(env.contextDir);
  if (env.json) { renderJson(io, result); return 0; }
  const rows = result.available.map((a) => ({
    key: a.key,
    adopted: a.adopted ? 'yes' : 'no ',
    path: a.path,
  }));
  const keyW = Math.max(3, ...rows.map((r) => r.key.length));
  io.stdout(`${'key'.padEnd(keyW)}  adopted  path\n`);
  for (const r of rows) {
    io.stdout(`${r.key.padEnd(keyW)}  ${r.adopted}      ${r.path}\n`);
  }
  return 0;
}

async function runShow(
  env: ReturnType<typeof resolveEnv>,
  subRest: string[],
  io: IOStreams,
): Promise<number> {
  if (subRest.length === 0 || subRest[0].startsWith('--')) {
    io.stderr(`loom procedures show: requires a <key>\n${USAGE}`);
    return 2;
  }
  const key = subRest[0];
  const rest = subRest.slice(1);
  try {
    parseArgs({ args: rest, options: {}, strict: true, allowPositionals: false });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  try {
    const detail = await showProcedure(env.contextDir, key);
    if (env.json) { renderJson(io, detail); return 0; }
    io.stdout(detail.body ?? detail.template);
    if (!(detail.body ?? detail.template).endsWith('\n')) io.stdout('\n');
    return 0;
  } catch (err) {
    if (err instanceof UnknownProcedureError) {
      io.stderr(`${err.message}\n`);
      return 2;
    }
    io.stderr(`loom procedures show: ${(err as Error).message}\n`);
    return 1;
  }
}

async function runAdopt(
  env: ReturnType<typeof resolveEnv>,
  subRest: string[],
  io: IOStreams,
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: subRest,
      options: {
        all:   { type: 'boolean' },
        force: { type: 'boolean' },
        help:  { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }

  if (parsed.values.help) { io.stdout(USAGE); return 0; }

  const positionals = parsed.positionals;
  const wantAll = parsed.values.all === true;
  const overwrite = parsed.values.force === true;

  if (wantAll && positionals.length > 0) {
    io.stderr('loom procedures adopt: --all and positional keys are mutually exclusive\n');
    return 2;
  }

  let keys: string[];
  if (wantAll) {
    const { available } = await listProcedures(env.contextDir);
    keys = available.map((a) => a.key);
  } else if (positionals.length > 0) {
    keys = positionals;
  } else {
    if (!io.stdinIsTTY) {
      io.stderr('loom procedures adopt: <keys> or --all required when stdin is not a TTY\n');
      return 2;
    }
    io.stderr(`loom procedures adopt: interactive picker not implemented yet\n${USAGE}`);
    return 2;
  }

  try {
    const results = await adoptProcedures(env.contextDir, keys, { overwrite });
    if (env.json) { renderJson(io, results); return 0; }
    for (const r of results) {
      io.stdout(`${r.key}: ${r.path} (${r.action})\n`);
    }
    return 0;
  } catch (err) {
    if (err instanceof UnknownProcedureError) {
      io.stderr(`${err.message}\n`);
      return 2;
    }
    io.stderr(`loom procedures adopt: ${(err as Error).message}\n`);
    return 1;
  }
}
