/**
 * Shared argv helpers — global flag resolution + context-dir/env
 * precedence. Individual commands parse their own subcommand flags
 * via node:util parseArgs.
 */
import { resolve } from 'node:path';
import { homedir } from 'node:os';

export interface ResolvedEnv {
  contextDir: string;
  client?: string;
  model?: string;
  json: boolean;
}

export interface RawGlobalFlags {
  contextDir?: string;
  client?: string;
  model?: string;
  json?: boolean;
}

export function resolveEnv(
  flags: RawGlobalFlags,
  processEnv: NodeJS.ProcessEnv,
): ResolvedEnv {
  const contextDir =
    flags.contextDir ??
    processEnv.LOOM_CONTEXT_DIR ??
    resolve(homedir(), '.config', 'loom', 'default');
  return {
    contextDir: resolve(contextDir),
    client: flags.client ?? processEnv.LOOM_CLIENT,
    model: flags.model ?? processEnv.LOOM_MODEL,
    json: Boolean(flags.json),
  };
}

/**
 * Extracts global flags from an argv slice, returning the remaining argv.
 * Recognizes: --context-dir, --client, --model, --json.
 */
export function extractGlobalFlags(argv: string[]): {
  flags: RawGlobalFlags;
  rest: string[];
} {
  const flags: RawGlobalFlags = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--context-dir') { flags.contextDir = argv[++i]; continue; }
    if (a === '--client')      { flags.client     = argv[++i]; continue; }
    if (a === '--model')       { flags.model      = argv[++i]; continue; }
    if (a === '--json')        { flags.json = true;            continue; }
    rest.push(a);
  }
  return { flags, rest };
}
