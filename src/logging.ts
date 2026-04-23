/**
 * Debug logging — emit structured lines to stderr when LOOM_LOG=debug
 * or when --verbose is active for a CLI invocation.
 *
 * verbose mode (--verbose): human-readable stats for a single command
 * debug mode (LOOM_LOG=debug): detailed internal tracing for all operations
 */

let _verbose = false;

/** Enable verbose output for the current process (set once at CLI startup). */
export function setVerbose(v: boolean): void {
  _verbose = v;
}

export function isVerbose(): boolean {
  return _verbose;
}

export function isDebug(): boolean {
  return process.env.LOOM_LOG === 'debug' || _verbose;
}

/**
 * Emit a structured debug line to stderr.
 * Active when LOOM_LOG=debug or --verbose is set.
 */
export function debugLog(
  phase: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!isDebug()) return;
  const ts = new Date().toISOString();
  const extra = data ? ' ' + JSON.stringify(data) : '';
  process.stderr.write(`[loom:debug] ${ts} [${phase}] ${message}${extra}\n`);
}

/**
 * Emit a verbose line to stderr (--verbose only, not LOOM_LOG=debug).
 * Use for human-readable per-command stats.
 */
export function verboseLog(message: string): void {
  if (!_verbose) return;
  process.stderr.write(`[loom:verbose] ${message}\n`);
}

/**
 * Run fn, log timing to debug, return result + elapsed ms.
 */
export async function timed<T>(
  phase: string,
  label: string,
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  if (isDebug()) {
    debugLog(phase, `${label} completed`, { ms });
  }
  return { result, ms };
}
