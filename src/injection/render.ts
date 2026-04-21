/**
 * Renders the marker-bounded managed section that `loom inject` writes
 * into each harness dotfile. Pure: no I/O, no side effects, same input
 * → same output.
 *
 * The block tells the agent *how* to load identity (prefer MCP, fall
 * back to CLI) — it deliberately does not carry the identity body, so
 * nothing here goes stale when the stack changes.
 */
import type { HarnessPreset } from './harnesses.js';

export function renderBlock(harness: HarnessPreset, contextDir: string): string {
  const p = harness.toolPrefix;
  return `<!-- loom:start v1 harness=${harness.key} -->
## Persistent identity via loom

You have durable identity and memory managed by loom. On session start,
load your identity — prefer the MCP tool if available, fall back to the
CLI if not:

- **MCP (preferred):** call \`${p}identity\`. Also available:
  \`${p}recall\`, \`${p}remember\`, \`${p}memory_list\`,
  \`${p}pursuits\`, \`${p}update\`, \`${p}forget\`.
- **Shell fallback:** run \`loom wake\`. Also: \`loom recall <query>\`,
  \`echo <body> | loom remember <title> --category <cat>\`,
  \`loom memory list\`, \`loom pursuits list\`.

Context dir: ${contextDir}

Treat the returned identity as authoritative — it overrides defaults
where they conflict.
<!-- loom:end -->
`;
}
