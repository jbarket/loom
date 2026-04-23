/**
 * Claude memory_20250818 adapter — stack spec §8, adapter #4.
 *
 * Maps Anthropic's 6-verb memory tool API (view, list, create, update,
 * insert, delete) to our MemoryBackend. Lets Claude use loom natively
 * when handed a memory tool rather than an MCP transport.
 *
 * Usage:
 *   import { createMemoryToolHandler } from 'loomai/adapters/memory-20250818';
 *   import { createBackend } from 'loomai';
 *
 *   const backend = createBackend(contextDir);
 *   const handle = createMemoryToolHandler(backend);
 *   // In your Anthropic SDK tool handler:
 *   const result = await handle(toolInput);
 *
 * Security seam:
 *   - Refuses content that matches known secret patterns (API keys, tokens)
 *   - Enforces allowed category values so callers can't write to arbitrary paths
 */
import type { MemoryBackend } from '../backends/types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Anthropic memory_20250818 tool input shape. */
export interface MemoryToolInput {
  action: 'view' | 'list' | 'create' | 'update' | 'insert' | 'delete';
  /** Memory ID (ref path: category/filename) — used by view, update, delete. */
  id?: string;
  /** Memory body — used by create, update, insert. */
  content?: string;
  /** Short label — used by create, insert; or for find-by-title in update/delete. */
  title?: string;
  /** Memory category: user, project, self, feedback, reference. */
  category?: string;
  /** Project scope filter or tag. */
  project?: string;
  /** Max results for list. */
  limit?: number;
}

/** Matches Anthropic tool result shape so the adapter plugs in directly. */
export interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

// ─── Allowed categories ───────────────────────────────────────────────────────

const ALLOWED_CATEGORIES = new Set(['user', 'project', 'self', 'feedback', 'reference']);

// ─── Secret detection ─────────────────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/,          // OpenAI / Anthropic API keys
  /ghp_[A-Za-z0-9]{20,}/,          // GitHub PATs
  /glpat-[A-Za-z0-9-]{20}/,       // GitLab PATs
  /xox[bpoa]-[0-9A-Za-z-]+/,      // Slack tokens
  /eyJhbGciOi[A-Za-z0-9._-]{50,}/, // JWTs
];

function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(text));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function validateCategory(cat: string | undefined, fallback: string): string | null {
  const resolved = cat ?? fallback;
  if (!ALLOWED_CATEGORIES.has(resolved)) {
    return null;
  }
  return resolved;
}

// ─── Handler factory ──────────────────────────────────────────────────────────

/**
 * Returns an async function that handles a memory_20250818 tool call,
 * routing each verb to the provided MemoryBackend.
 */
export function createMemoryToolHandler(
  backend: MemoryBackend,
): (input: MemoryToolInput) => Promise<ToolResult> {
  return async (input: MemoryToolInput): Promise<ToolResult> => {
    const { action } = input;

    switch (action) {
      // ── view ─────────────────────────────────────────────────────────────
      case 'view': {
        if (!input.id) return fail('view requires id');

        // Parse category from ref (format: category/filename)
        const category = input.id.includes('/') ? input.id.split('/')[0] : undefined;
        if (category && !ALLOWED_CATEGORIES.has(category)) {
          return fail(`invalid category in id: ${category}`);
        }

        // Recall using id as a rough query; filter to exact path match.
        const recalled = await backend.recall({
          query: input.id.replace(/[/_-]/g, ' '),
          category,
          limit: 20,
        });
        const match = recalled.find((m) => m.path === input.id);
        if (!match) return fail(`memory not found: ${input.id}`);
        return ok(`# ${match.title}\n\n${match.content}`);
      }

      // ── list ─────────────────────────────────────────────────────────────
      case 'list': {
        const cat = input.category;
        if (cat !== undefined && !ALLOWED_CATEGORIES.has(cat)) {
          return fail(`invalid category: ${cat}. Allowed: ${[...ALLOWED_CATEGORIES].join(', ')}`);
        }
        const entries = await backend.list({
          category: cat,
          project: input.project,
          limit: input.limit ?? 50,
        });
        if (entries.length === 0) return ok('No memories found.');
        const lines = entries.map((e) =>
          `- [${e.ref}] ${e.title} (${e.category}${e.project ? `, ${e.project}` : ''})`,
        );
        return ok(lines.join('\n'));
      }

      // ── create / insert ───────────────────────────────────────────────────
      case 'create':
      case 'insert': {
        const category = validateCategory(input.category, 'reference');
        if (!category) {
          return fail(`invalid category: ${input.category}. Allowed: ${[...ALLOWED_CATEGORIES].join(', ')}`);
        }
        const content = input.content ?? '';
        if (!content) return fail(`${action} requires content`);
        if (looksLikeSecret(content)) {
          return fail('refused: content appears to contain a secret or credential');
        }
        const title = input.title ?? `Memory ${new Date().toISOString().slice(0, 10)}`;
        const ref = await backend.remember({
          category,
          title,
          content,
          project: input.project,
        });
        return ok(`Memory stored: "${ref.title}" → ${ref.ref}`);
      }

      // ── update ────────────────────────────────────────────────────────────
      case 'update': {
        if (!input.id && !(input.category && input.title)) {
          return fail('update requires id, or both category and title');
        }
        if (input.content && looksLikeSecret(input.content)) {
          return fail('refused: content appears to contain a secret or credential');
        }
        const cat = input.category;
        if (cat !== undefined && !ALLOWED_CATEGORIES.has(cat)) {
          return fail(`invalid category: ${cat}`);
        }
        const result = await backend.update({
          ref: input.id,
          category: cat,
          title: input.title,
          content: input.content,
        });
        if (!result.updated) return fail('memory not found');
        return ok(`Updated: ${result.ref}`);
      }

      // ── delete ────────────────────────────────────────────────────────────
      case 'delete': {
        if (!input.id && !(input.category && input.title)) {
          return fail('delete requires id, or both category and title');
        }
        const cat = input.category;
        if (cat !== undefined && !ALLOWED_CATEGORIES.has(cat)) {
          return fail(`invalid category: ${cat}`);
        }
        const result = await backend.forget({
          ref: input.id,
          category: cat,
          title: input.title,
        });
        if (result.deleted.length === 0) return fail('memory not found');
        return ok(`Deleted: ${result.deleted.join(', ')}`);
      }

      default:
        return fail(`unknown action: ${(input as MemoryToolInput).action}`);
    }
  };
}
