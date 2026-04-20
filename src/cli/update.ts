/**
 * loom update — modify an existing memory.
 */
import { parseArgs } from 'node:util';
import { update } from '../tools/update.js';
import { createBackend } from '../backends/index.js';
import { assertStackVersionCompatible } from '../config.js';
import { extractGlobalFlags, resolveEnv } from './args.js';
import { readBody, renderJson } from './io.js';
import type { IOStreams } from './io.js';
import type { UpdateInput } from '../backends/types.js';

export const USAGE = `Usage: loom update <ref> [options]
       loom update --category <cat> --title <exact> [options]

Updates content (from stdin or \$EDITOR) and/or metadata on an existing
memory.

Options:
  --category <name>      Identify by category (with --title)
  --title <exact>        Identify by title (with --category)
  --json                 Emit UpdateResult
  --context-dir <path>   Agent context dir
  --help, -h             Show this help
`;

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        category: { type: 'string' },
        title:    { type: 'string' },
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

  const ref = parsed.positionals[0];
  const hasIdentifier = ref || (parsed.values.category && parsed.values.title);
  if (!hasIdentifier) {
    io.stderr(`Provide a <ref> or --category+--title.\n${USAGE}`);
    return 2;
  }

  const env = resolveEnv(global, io.env);
  try { assertStackVersionCompatible(env.contextDir); }
  catch (err) { io.stderr(`${(err as Error).message}\n`); return 1; }

  let body: string;
  try {
    body = await readBody(io, 'update');
  } catch (err) {
    io.stderr(`${(err as Error).message}\n`);
    return 1;
  }
  if (!body) { io.stderr(`body cannot be empty\n`); return 2; }

  const input: UpdateInput = {
    ref,
    category: parsed.values.category,
    title:    parsed.values.title,
    content:  body,
  };

  if (env.json) {
    const backend = createBackend(env.contextDir);
    const result = await backend.update(input);
    renderJson(io, result);
    return result.updated ? 0 : 3;
  }
  const text = await update(env.contextDir, input);
  io.stdout(text.endsWith('\n') ? text : text + '\n');
  return /not found/i.test(text) ? 3 : 0;
}
