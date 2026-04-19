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
 *   3. ~/.config/loom/default (fallback)
 */
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export function resolveContextDir(): string {
  if (process.env.LOOM_CONTEXT_DIR) {
    return resolve(process.env.LOOM_CONTEXT_DIR);
  }

  const argIdx = process.argv.indexOf('--context-dir');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return resolve(process.argv[argIdx + 1]);
  }

  return resolve(homedir(), '.config', 'loom', 'default');
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
