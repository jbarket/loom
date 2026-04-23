/**
 * loom wake — prints agent identity markdown to stdout.
 */
import { parseArgs } from 'node:util';
import { loadIdentity, type IdentityLoadStats } from '../tools/identity.js';
import { assertStackVersionCompatible } from '../config.js';
import { extractGlobalFlags, resolveEnv } from './args.js';
import { setVerbose, verboseLog } from '../logging.js';
import type { IOStreams } from './io.js';

const USAGE = `Usage: loom wake [options]

Prints the agent's wake output (identity, preferences, self-model,
harness manifest, model manifest, procedures) to stdout.

Options:
  --project <name>       Load projects/<name>.md as additional context
  --context-dir <path>   Agent context dir
  --client <name>        Harness adapter hint
  --model <name>         Model manifest hint
  --verbose              Print per-section stats to stderr
  --help, -h             Show this help
`;

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        project: { type: 'string' },
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

  if (env.verbose) {
    setVerbose(true);
  }

  try {
    assertStackVersionCompatible(env.contextDir);
  } catch (err) {
    io.stderr(`${(err as Error).message}\n`);
    return 1;
  }

  const onStats = env.verbose
    ? (stats: IdentityLoadStats) => {
        const pad = (s: string, n: number) => s.padEnd(n);
        verboseLog(`context-dir: ${env.contextDir}`);
        verboseLog(`─────────────────────────────────────────`);
        for (const s of stats.sections) {
          const status = s.present
            ? `${s.bytes.toLocaleString()} bytes  ${s.ms}ms`
            : 'missing';
          verboseLog(`${pad(s.name, 24)} ${status}`);
        }
        verboseLog(`─────────────────────────────────────────`);
        verboseLog(`total  ${stats.totalBytes.toLocaleString()} bytes  ${stats.totalMs}ms`);
        if (stats.warnings.length > 0) {
          verboseLog(`warnings: ${stats.warnings.length}`);
          for (const w of stats.warnings) {
            verboseLog(`  [${w.code}] ${w.message}`);
          }
        }
      }
    : undefined;

  const md = await loadIdentity(
    env.contextDir,
    parsed.values.project,
    env.client,
    env.model,
    onStats,
  );
  io.stdout(md.endsWith('\n') ? md : md + '\n');
  return 0;
}
