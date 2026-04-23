/**
 * Configuration — resolves directories and backend settings for a
 * given loom agent.
 *
 * The context directory is the agent's brain — everything
 * agent-specific lives here:
 *   IDENTITY.md       — the terminal creed (who this agent is)
 *   preferences.md    — user preferences and working style
 *   self-model.md     — agent capability tracking
 *   memories.db       — sqlite + sqlite-vec memory store
 *   pursuits.md       — active goals
 *
 * Context dir resolution order:
 *   1. LOOM_CONTEXT_DIR environment variable
 *   2. --context-dir CLI argument
 *   3. ~/.config/loom/current  →  ~/.config/loom/<name>
 *   4. ~/.config/loom/default (fallback)
 */
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Filename of the active-agent pointer under ~/.config/loom/. */
export const CURRENT_POINTER_FILENAME = 'current';

/**
 * Read the active-agent pointer file synchronously.
 * Returns the agent name if the file exists and contains a valid name,
 * or null otherwise. Used in context-dir resolution.
 */
export function readCurrentPointerSync(home: string): string | null {
  const p = join(home, '.config', 'loom', CURRENT_POINTER_FILENAME);
  if (!existsSync(p)) return null;
  try {
    const name = readFileSync(p, 'utf-8').trim();
    if (
      name.length > 0 &&
      !name.includes('/') &&
      !name.includes('\\') &&
      name !== CURRENT_POINTER_FILENAME
    ) {
      return name;
    }
  } catch { /* fall through */ }
  return null;
}

export function resolveContextDir(): string {
  if (process.env.LOOM_CONTEXT_DIR) {
    return resolve(process.env.LOOM_CONTEXT_DIR);
  }

  const argIdx = process.argv.indexOf('--context-dir');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return resolve(process.argv[argIdx + 1]);
  }

  const home = homedir();
  const pointed = readCurrentPointerSync(home);
  if (pointed) {
    return resolve(join(home, '.config', 'loom', pointed));
  }

  return resolve(home, '.config', 'loom', 'default');
}

/**
 * Resolve the loom repo root from the running module location.
 * Works from both src/ (dev via tsx) and dist/ (production).
 */
export function resolveRepoRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(dirname(thisFile), '..');
}

export function resolveSqliteDbPath(contextDir: string): string {
  return process.env.LOOM_SQLITE_DB_PATH ?? resolve(contextDir, 'memories.db');
}

export function resolveFastEmbedModel(): string {
  return process.env.LOOM_FASTEMBED_MODEL ?? 'fast-bge-small-en-v1.5';
}

export function resolveFastEmbedCacheDir(): string | undefined {
  return process.env.LOOM_FASTEMBED_CACHE_DIR || undefined;
}

// ─── Stack version ────────────────────────────────────────────────────────────

/** The stack schema version this loom build understands. */
export const CURRENT_STACK_VERSION = 1;

/** The filename at the stack root that records the on-disk schema version. */
export const STACK_VERSION_FILE = 'LOOM_STACK_VERSION';

/**
 * Read the stack version stamp at `<contextDir>/LOOM_STACK_VERSION`.
 * Returns null if the file is missing, or NaN if the content doesn't parse.
 */
export function readStackVersion(contextDir: string): number | null {
  const path = resolve(contextDir, STACK_VERSION_FILE);
  if (!existsSync(path)) return null;
  return Number.parseInt(readFileSync(path, 'utf-8').trim(), 10);
}

/**
 * Lazy-write the current stack version if the stamp is missing. Does not
 * overwrite an existing file; the caller is responsible for validating
 * (and refusing) versions ahead of CURRENT_STACK_VERSION.
 */
export function ensureStackVersion(contextDir: string): void {
  const path = resolve(contextDir, STACK_VERSION_FILE);
  if (existsSync(path)) return;
  writeFileSync(path, `${CURRENT_STACK_VERSION}\n`, 'utf-8');
}

/**
 * Refuse to operate against a stack at a higher version than this build
 * understands; stamp the current version if the file is missing.
 */
export function assertStackVersionCompatible(contextDir: string): void {
  const onDisk = readStackVersion(contextDir);
  if (onDisk !== null) {
    if (Number.isNaN(onDisk)) {
      throw new Error(
        `LOOM_STACK_VERSION unparseable at ${contextDir}/${STACK_VERSION_FILE}. ` +
        `Expected an integer; got raw content.`,
      );
    }
    if (onDisk > CURRENT_STACK_VERSION) {
      throw new Error(
        `Stack at ${contextDir} is version ${onDisk}; ` +
        `this loom build understands up to v${CURRENT_STACK_VERSION}. Upgrade loom.`,
      );
    }
  }
  ensureStackVersion(contextDir);
}
