/**
 * Memory backend types — shared across all backend implementations.
 *
 * These types define the contract between the MCP tool layer and the
 * storage backend. Any backend that implements MemoryBackend can be
 * swapped in; v0.3.1 ships SqliteVecBackend as the single opinion.
 */

// ─── Input / Output Types ────────────────────────────────────────────────────

export interface MemoryInput {
  category: string;
  title: string;
  content: string;
  project?: string;
  metadata?: Record<string, unknown>;
  /** Optional time-to-live. Parsed durations like "7d", "30d", or "permanent". */
  ttl?: string;
}

export interface MemoryRef {
  ref: string;
  category: string;
  filename: string;
  title: string;
}

export interface RecallInput {
  query: string;
  category?: string;
  project?: string;
  limit?: number;
}

export interface MemoryMatch {
  path: string;
  title: string;
  category: string;
  project?: string;
  created: string;
  content: string;
  relevance: number;
  /** ISO timestamp of last recall hit, if tracked */
  lastAccessed?: string;
  /** TTL value if set (e.g. "7d", "permanent") */
  ttl?: string;
  /** ISO timestamp when this memory expires, if TTL is set */
  expiresAt?: string;
}

export interface ForgetInput {
  /** Direct reference (category/filename) for single deletion */
  ref?: string;
  /** Find by category + title for single deletion */
  category?: string;
  title?: string;
  /** Bulk: delete all memories in this project */
  project?: string;
  /** Bulk: delete memories whose title matches this pattern.
   *  Supports glob-style `*` wildcards: "Forgejo sweep*" matches any title
   *  starting with "Forgejo sweep". Requires category or project as a scope guard. */
  title_pattern?: string;
}

export interface UpdateInput {
  /** Direct reference (category/filename) from remember's return value */
  ref?: string;
  /** Alternative: find by category + title */
  category?: string;
  title?: string;
  /** New content (replaces body, preserves frontmatter fields unless overridden) */
  content?: string;
  /** Metadata fields to add or update */
  metadata?: Record<string, unknown>;
}

export interface ForgetResult {
  /** Refs that were successfully deleted */
  deleted: string[];
}

export interface UpdateResult {
  /** Whether the update was applied */
  updated: boolean;
  /** The ref of the updated memory (when found) */
  ref?: string;
}

export interface PruneResult {
  /** Memories that were deleted because their TTL expired */
  expired: string[];
  /** Memories that haven't been accessed within the stale threshold */
  stale: string[];
}

export interface ListInput {
  category?: string;
  project?: string;
  limit?: number;
}

export interface MemoryEntry {
  ref: string;
  title: string;
  category: string;
  project?: string;
  created: string;
}

export interface MemoryExportEntry {
  ref: string;
  category: string;
  title: string;
  content: string;
  project?: string;
  metadata: Record<string, unknown>;
  ttl?: string;
  created: string;
  updated?: string;
}

export interface ExportInput {
  category?: string;
  project?: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
}

// ─── Backend Interface ───────────────────────────────────────────────────────

export interface MemoryBackend {
  remember(input: MemoryInput): Promise<MemoryRef>;
  recall(input: RecallInput): Promise<MemoryMatch[]>;
  forget(input: ForgetInput): Promise<ForgetResult>;
  update(input: UpdateInput): Promise<UpdateResult>;
  /** Remove expired memories and report stale ones. */
  prune(options?: { dryRun?: boolean; staleDays?: number }): Promise<PruneResult>;
  list(input: ListInput): Promise<MemoryEntry[]>;
  export(input: ExportInput): Promise<MemoryExportEntry[]>;
  import(entries: MemoryExportEntry[]): Promise<ImportResult>;
}

// ─── Embedding Interface (used by vector backends) ───────────────────────────

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Optional: query-optimized embedding for search (BGE-family models).
   *  Falls back to embed() when absent. */
  embedQuery?(text: string): Promise<number[]>;
  readonly dimensions: number;
}
