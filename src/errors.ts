/**
 * Structured error codes for loom. Shared across CLI and MCP surfaces.
 *
 * All codes begin with LOOM_E_. They appear:
 *   - In thrown LoomError messages: "[LOOM_E_STACK_VERSION] Stack at ..."
 *   - In identity() warning section: "**LOOM_E_MISSING_MANIFEST** ..."
 *   - In debug log data: { code: "LOOM_E_EMBED_DOWNLOAD", ... }
 *
 * See docs/observability.md for the full reference table.
 */

// ─── Error codes ─────────────────────────────────────────────────────────────

/** Stack version on disk is newer than this loom binary understands. */
export const LOOM_E_STACK_VERSION = 'LOOM_E_STACK_VERSION';

/** FastEmbed model download failed (network or disk error). */
export const LOOM_E_EMBED_DOWNLOAD = 'LOOM_E_EMBED_DOWNLOAD';

/** FastEmbed model failed to initialize (bad ONNX file, wrong model id). */
export const LOOM_E_EMBED_INIT = 'LOOM_E_EMBED_INIT';

/** memories.db is missing, corrupt, or incompatible with the current schema. */
export const LOOM_E_MEMORIES_CORRUPT = 'LOOM_E_MEMORIES_CORRUPT';

/** A harness or model manifest file is missing from the context directory. */
export const LOOM_E_MISSING_MANIFEST = 'LOOM_E_MISSING_MANIFEST';

/** Context directory is missing or not accessible. */
export const LOOM_E_CONTEXT_DIR = 'LOOM_E_CONTEXT_DIR';

// ─── LoomError class ─────────────────────────────────────────────────────────

/**
 * Structured error thrown by loom internals. Always carries a machine-readable
 * code so callers (CLI, MCP) can map it to a user-friendly message.
 */
export class LoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'LoomError';
  }
}
