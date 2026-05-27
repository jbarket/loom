/**
 * Client adapters — runtime-specific context injected into identity loads.
 *
 * When `identity` is called with a `client` param (or LOOM_CLIENT env var),
 * the corresponding adapter is appended to the identity response. This tells
 * the agent how loom tools are named in its specific runtime.
 *
 * Built-in adapters ship with loom. User overrides live in
 * `<contextDir>/clients/<client>.md` and take precedence.
 *
 * Supported clients: claude-code, gemini-cli. Any other runtime can drop a
 * user override at `<contextDir>/clients/<name>.md`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ─── Tool list ────────────────────────────────────────────────────────────────

// Canonical tool names — used to generate the prefix-specific list per client
export const TOOLS = [
  'identity', 'remember', 'recall', 'update', 'forget',
  'memory_list', 'memory_prune', 'find_similar', 'memory_audit',
  'update_identity', 'bootstrap', 'harness_init',
];

function toolList(prefix: string): string {
  return TOOLS.map((t) => `\`${prefix}${t}\``).join(', ');
}

// ─── Built-in adapters ────────────────────────────────────────────────────────

const ADAPTERS: Record<string, string> = {
  'claude-code': `## Runtime: Claude Code

You are running in Claude Code (Anthropic CLI). Loom tools use double-underscore prefix:
${toolList('mcp__loom__')}`,

  'gemini-cli': `## Runtime: Gemini CLI

You are running in Gemini CLI (Google). Loom tools use double-underscore prefix:
${toolList('mcp__loom__')}`,
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export function getBuiltInAdapter(client: string): string | null {
  return ADAPTERS[client] ?? null;
}

/**
 * Load the adapter for a given client name.
 * Checks <contextDir>/clients/<client>.md first (user override),
 * then falls back to the built-in adapter.
 */
export async function loadClientAdapter(contextDir: string, client: string): Promise<string | null> {
  const overridePath = join(contextDir, 'clients', `${client}.md`);
  try {
    const content = await readFile(overridePath, 'utf-8');
    return content.trim();
  } catch {
    // no override, use built-in
  }
  return getBuiltInAdapter(client);
}


