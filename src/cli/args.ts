/**
 * Shared argv helpers — global flag resolution + context-dir/env
 * precedence. Individual commands parse their own subcommand flags
 * via node:util parseArgs.
 */
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { readCurrentPointerSync } from '../config.js';

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
  let contextDir: string;
  if (flags.contextDir) {
    contextDir = resolve(flags.contextDir);
  } else if (processEnv.LOOM_CONTEXT_DIR) {
    contextDir = resolve(processEnv.LOOM_CONTEXT_DIR);
  } else {
    const home = processEnv.HOME ?? homedir();
    const pointed = readCurrentPointerSync(home);
    contextDir = pointed
      ? resolve(join(home, '.config', 'loom', pointed))
      : resolve(home, '.config', 'loom', 'default');
  }
  return {
    contextDir,
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
