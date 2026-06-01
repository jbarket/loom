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

export interface ArchiveInput {
  /** Direct reference (category/filename) for single archive */
  ref?: string;
  /** Find by category + title for single archive */
  category?: string;
  title?: string;
  /** Tombstone note: who/why retired. Stored alongside the original body. */
  note?: string;
}

export interface ArchiveResult {
  /** Refs that were successfully archived (soft-retired) */
  archived: string[];
}

export interface RestoreInput {
  /** Direct reference (category/filename) to restore */
  ref?: string;
  /** Find by category + title */
  category?: string;
  title?: string;
}

export interface RestoreResult {
  /** Refs that were successfully restored to the active set */
  restored: string[];
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

export interface FindSimilarInput {
  /** Anchor on an existing memory's embedding. Exactly one of `ref`/`text`. */
  ref?: string;
  /** Or anchor on fresh text — embedded on the fly. */
  text?: string;
  /** Max neighbours to return (default 10). */
  limit?: number;
  /** Restrict candidates to a category. */
  category?: string;
  /** Restrict candidates to a project. */
  project?: string;
  /** Filter out matches below this cosine similarity (0..1). */
  minRelevance?: number;
}

export interface DuplicatePair {
  a: { ref: string; title: string };
  b: { ref: string; title: string };
  relevance: number;
}

export interface AuditOptions {
  /** Stale threshold in days (last_accessed/updated/created). Default 30. */
  staleDays?: number;
  /** Cosine-similarity floor for duplicate pairs (0..1). Default 0.85. */
  similarityThreshold?: number;
  /** Max duplicate pairs to surface. Default 20. */
  maxDuplicates?: number;
}

export interface AuditStaleEntry {
  ref: string;
  title: string;
  category: string;
  project?: string;
  /** ISO timestamp of last_accessed, falling back to updated, then created. */
  lastTouch: string;
}

export interface AuditReport {
  totalMemories: number;
  byCategory: Record<string, number>;
  /** Memories not touched within `staleDays`, excluding TTL=permanent. */
  stale: AuditStaleEntry[];
  /** Pairs of memories whose vector similarity ≥ `similarityThreshold`. */
  duplicates: DuplicatePair[];
  /** Memories whose TTL has expired (would be removed by `prune`). */
  expired: string[];
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
  /** Surface memories near (in embedding space) an existing ref or fresh text. */
  findSimilar(input: FindSimilarInput): Promise<MemoryMatch[]>;
  /** One-shot health report: counts, stale, duplicates, expired. Read-only. */
  audit(options?: AuditOptions): Promise<AuditReport>;
  /** Soft-retire a memory: archive with tombstone instead of hard delete. */
  archive(input: ArchiveInput): Promise<ArchiveResult>;
  /** Restore a previously archived memory to the active set. */
  restore(input: RestoreInput): Promise<RestoreResult>;
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

// ─── Knowledge Backend Types ─────────────────────────────────────────────────

export interface KnowledgePageInput {
  slug: string;
  title: string;
  domain: string;
  body: string;
  sourcing?: 'sourced' | 'provisional';
  provenance?: string;
  /** ISO timestamp the page's claims were last verified as true. Defaults to write time. */
  verified_at?: string;
  /** The version/date the claims are valid as-of, e.g. "Syntakt OS 1.21" or "as of 2026-05". */
  freshness_anchor?: string;
  citations?: KnowledgeCitationInput[];
}

export interface KnowledgeCitationInput {
  claim: string;
  source_kind: 'web' | 'loom_memory' | 'conversation';
  source_locator?: string;
  excerpt: string;
}

export interface KnowledgePage {
  id: number;
  uuid: string;
  slug: string;
  title: string;
  domain: string;
  body: string;
  sourcing: string;
  provenance: string | null;
  status: string;
  created: string;
  updated: string | null;
  last_accessed: string | null;
  hit_count: number;
}

export interface KnowledgeCitation {
  id: number;
  page_id: number;
  claim: string;
  source_kind: string;
  source_locator: string | null;
  excerpt: string;
  retrieved_at: string;
  created: string;
}

export interface KnowledgePageWithCitations extends KnowledgePage {
  citations: KnowledgeCitation[];
}

export interface KnowledgeQueryInput {
  query?: string;
  domain?: string;
  excludeStatus?: string;
  limit?: number;
}

export interface KnowledgePageRef {
  uuid: string;
  slug: string;
  title: string;
}

export interface KnowledgeWriteResult extends KnowledgePageRef {
  citationsAdded: number;
}

export interface KnowledgeArchiveInput {
  slug: string;
  /** Optional tombstone note explaining why the page was retired. */
  note?: string;
}

export interface KnowledgeArchiveResult {
  slug: string;
  /** true if the page was found and archived; false if not found or already archived. */
  archived: boolean;
}

export interface KnowledgeRestoreInput {
  slug: string;
}

export interface KnowledgeRestoreResult {
  slug: string;
  /** true if the page was found in the archive and restored; false otherwise. */
  restored: boolean;
}

export interface KnowledgeSupersededInput {
  /** Slug of the page being retired (the duplicate / loser). */
  old_slug: string;
  /** Slug of the canonical replacement page (must already exist). */
  new_slug: string;
  /** Optional note explaining the merge/supersession decision. */
  note?: string;
}

export interface KnowledgeSupersessionRecord {
  id: number;
  old_slug: string;
  new_slug: string;
  note: string | null;
  created: string;
}

export interface KnowledgeSupersededResult {
  old_slug: string;
  new_slug: string;
  /** true if the old page was archived as part of this operation. */
  archived: boolean;
}

// ─── Knowledge Backend Interface ─────────────────────────────────────────────

export interface KnowledgeBackend {
  /** Upsert an entity page by slug; create or append. */
  writePage(input: KnowledgePageInput): Promise<KnowledgeWriteResult>;
  /** Get a single page by slug. */
  getPage(slug: string): Promise<KnowledgePageWithCitations | null>;
  /** List pages with optional filters. */
  listPages(input?: KnowledgeQueryInput): Promise<KnowledgePageWithCitations[]>;
  /** LIKE search over title, body, and domain. */
  queryPages(input: KnowledgeQueryInput): Promise<KnowledgePageWithCitations[]>;
  /** Add citations to an existing page by slug. */
  addCitations(slug: string, citations: KnowledgeCitationInput[]): Promise<number>;
  /** Soft-retire a page: set status='archived' with an optional tombstone note. */
  archivePage(input: KnowledgeArchiveInput): Promise<KnowledgeArchiveResult>;
  /** Restore a previously archived page back to active. */
  restorePage(input: KnowledgeRestoreInput): Promise<KnowledgeRestoreResult>;
  /** Mark old_slug as superseded by new_slug, archive old_slug, and record the supersession. */
  supersedePage(input: KnowledgeSupersededInput): Promise<KnowledgeSupersededResult>;
  /** Close the underlying SQLite connection. */
  close(): void;
}
