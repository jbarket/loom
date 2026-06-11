/**
 * Shared memory category vocabulary — the single source of truth for
 * write-side category enforcement across MCP schemas and the CLI
 * (store-convergence spec, "One boundary discipline").
 *
 * Reads (recall / memory_list / forget) intentionally accept arbitrary
 * strings so memories written before the vocabulary existed (e.g.
 * legacy "general") stay reachable. Only writes are enforced.
 */
export const MEMORY_CATEGORIES = [
  'user',
  'project',
  'self',
  'feedback',
  'reference',
  'pursuit',
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export function isMemoryCategory(value: string): value is MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value);
}
