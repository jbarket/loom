/**
 * loom pursuits — manage active pursuits.
 */
import { parseArgs } from 'node:util';
import { pursuits } from '../tools/pursuits.js';
import { assertStackVersionCompatible } from '../config.js';
import { extractGlobalFlags, resolveEnv } from './args.js';
import { renderJson } from './io.js';
import type { IOStreams } from './io.js';
import type { PursuitAction, PursuitInput } from '../tools/pursuits.js';

const USAGE = `Usage:
  loom pursuits list
  loom pursuits add <name> --goal <text>
  loom pursuits update <name> --progress <text>
  loom pursuits complete <name>
  loom pursuits park <name> [--reason <text>]
  loom pursuits resume <name>

Options:
  --json                 Emit result payload as JSON
  --context-dir <path>   Agent context dir
  --help, -h             Show this help
`;

const NAME_REQUIRED: Set<PursuitAction> = new Set(
  ['add', 'update', 'complete', 'park', 'resume'],
);
const ALL_ACTIONS: Set<PursuitAction> = new Set(
  ['list', 'add', 'update', 'complete', 'park', 'resume'],
);

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  const action = rest[0] as PursuitAction | undefined;

  if (!action || action === ('--help' as PursuitAction) || action === ('-h' as PursuitAction)) {
    io.stdout(USAGE);
    return action ? 0 : 2;
  }
  if (!ALL_ACTIONS.has(action)) {
    io.stderr(`Unknown action "${action}".\n${USAGE}`);
    return 2;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: rest.slice(1),
      options: {
        goal:     { type: 'string' },
        progress: { type: 'string' },
        reason:   { type: 'string' },
        help:     { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  if (parsed.values.help) { io.stdout(USAGE); return 0; }

  const name = parsed.positionals[0];
  if (NAME_REQUIRED.has(action) && !name) {
    io.stderr(`<name> is required for "${action}".\n${USAGE}`);
    return 2;
  }

  const env = resolveEnv(global, io.env);
  try { assertStackVersionCompatible(env.contextDir); }
  catch (err) { io.stderr(`${(err as Error).message}\n`); return 1; }

  const input: PursuitInput = {
    action,
    name,
    goal:     parsed.values.goal,
    progress: parsed.values.progress,
    reason:   parsed.values.reason,
  };

  const text = await pursuits(env.contextDir, input);
  if (env.json) { renderJson(io, { action, name, message: text }); return 0; }
  io.stdout(text.endsWith('\n') ? text : text + '\n');
  return 0;
}
