/**
 * loom memory — list / prune the memory store.
 */
import { parseArgs } from 'node:util';
import { memoryList } from '../tools/memory-list.js';
import { prune } from '../tools/prune.js';
import { createBackend } from '../backends/index.js';
import { assertStackVersionCompatible } from '../config.js';
import { extractGlobalFlags, resolveEnv } from './args.js';
import { renderJson } from './io.js';
import type { IOStreams } from './io.js';

const USAGE = `Usage: loom memory <subcommand> [options]

Subcommands:
  list    Browse memories (table or --json)
  prune   Report / remove expired and stale memories

Options (list):
  --category <name>    Filter
  --project <name>     Filter
  --limit <n>          Max entries
  --json               Emit MemoryEntry[]

Options (prune):
  --stale-days <n>     Stale threshold in days
  --dry-run            Report what would be pruned, don't delete
  --json               Emit PruneResult

Global: --context-dir, --help/-h
`;

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  const sub = rest[0];
  const subRest = rest.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    io.stdout(USAGE);
    return sub ? 0 : 2;
  }
  if (sub !== 'list' && sub !== 'prune') {
    io.stderr(`Unknown memory subcommand: ${sub}\n${USAGE}`);
    return 2;
  }

  const env = resolveEnv(global, io.env);
  try { assertStackVersionCompatible(env.contextDir); }
  catch (err) { io.stderr(`${(err as Error).message}\n`); return 1; }

  if (sub === 'list') {
    let parsed;
    try {
      parsed = parseArgs({
        args: subRest,
        options: {
          category: { type: 'string' },
          project:  { type: 'string' },
          limit:    { type: 'string' },
        },
        strict: true,
        allowPositionals: false,
      });
    } catch (err) {
      io.stderr(`${(err as Error).message}\n${USAGE}`);
      return 2;
    }
    const limit = parsed.values.limit !== undefined
      ? Number.parseInt(parsed.values.limit, 10)
      : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      io.stderr(`--limit must be a positive integer.\n`);
      return 2;
    }
    const input = {
      category: parsed.values.category,
      project:  parsed.values.project,
      limit,
    };
    if (env.json) {
      const backend = createBackend(env.contextDir);
      renderJson(io, await backend.list(input));
      return 0;
    }
    const text = await memoryList(env.contextDir, input);
    io.stdout(text.endsWith('\n') ? text : text + '\n');
    return 0;
  }

  // prune
  let parsed;
  try {
    parsed = parseArgs({
      args: subRest,
      options: {
        'stale-days': { type: 'string' },
        'dry-run':    { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const staleDays = parsed.values['stale-days'] !== undefined
    ? Number.parseInt(parsed.values['stale-days'], 10)
    : undefined;
  if (staleDays !== undefined && (!Number.isInteger(staleDays) || staleDays <= 0)) {
    io.stderr(`--stale-days must be a positive integer.\n`);
    return 2;
  }
  const dryRun = Boolean(parsed.values['dry-run']);
  const options = { staleDays, dryRun };

  if (env.json) {
    const backend = createBackend(env.contextDir);
    renderJson(io, await backend.prune(options));
    return 0;
  }
  const text = await prune(env.contextDir, options);
  io.stdout(text.endsWith('\n') ? text : text + '\n');
  return 0;
}
