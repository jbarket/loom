/**
 * Anthropic memory_20250818 adapter for loom.
 *
 * Bridges Anthropic's 6-verb memory-tool API (view, list, create, update,
 * insert, delete) to the loom MemoryBackend. Lets callers who use the
 * Anthropic SDK directly — without an MCP-capable harness — wire loom as
 * their memory backend.
 *
 * Seam enforcement (stack spec §7):
 *   - Refuses content containing secrets (API keys, tokens, private keys).
 *   - Refuses writes to sleeve-scoped categories (todo, scratch, session, …).
 *
 * Usage:
 *   import { AnthropicMemoryAdapter, MEMORY_TOOL_DEFINITION } from './adapters/anthropic-memory-20250818.js';
 *
 *   const adapter = new AnthropicMemoryAdapter(contextDir);
 *   // Include MEMORY_TOOL_DEFINITION in the tools[] array on your API call.
 *   // For each tool_use block Claude returns, call:
 *   const text = await adapter.handle(block.input as MemoryToolInput);
 *   // Return text as a tool_result content block.
 *
 * Identity (wake sequence §5):
 *   Call view("_identity") to load the full loom identity payload at session
 *   start. This maps the MCP `identity` tool onto the memory verb surface.
 */

import { createBackend } from '../backends/index.js';
import type { MemoryBackend } from '../backends/types.js';
import { loadIdentity } from '../tools/identity.js';

// ─── Verb Input Types ─────────────────────────────────────────────────────────

export interface ViewInput {
  action: 'view';
  /** Memory ref (e.g. "user/prefs-abc123"), or "_identity" to load the identity payload. */
  ref: string;
}

export interface ListInput {
  action: 'list';
  category?: string;
  project?: string;
  limit?: number;
}

export interface CreateInput {
  action: 'create';
  title: string;
  content: string;
  /** Defaults to "self" when omitted. */
  category?: string;
  project?: string;
  /** Time-to-live: "7d", "30d", "24h", "permanent". */
  ttl?: string;
}

export interface UpdateInput {
  action: 'update';
  ref: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface InsertInput {
  action: 'insert';
  memories: Array<{
    title: string;
    content: string;
    /** Defaults to "self" when omitted. */
    category?: string;
    project?: string;
    ttl?: string;
  }>;
}

export interface DeleteInput {
  action: 'delete';
  ref: string;
}

export type MemoryToolInput =
  | ViewInput
  | ListInput
  | CreateInput
  | UpdateInput
  | InsertInput
  | DeleteInput;

// ─── Tool Definition ──────────────────────────────────────────────────────────

/** Name Claude uses when calling this tool. */
export const MEMORY_TOOL_NAME = 'memory' as const;

/**
 * Tool definition to include in the `tools` array when calling the Anthropic
 * API. Claude will use this schema to generate tool_use blocks that the
 * adapter handles.
 */
export const MEMORY_TOOL_DEFINITION = {
  name: MEMORY_TOOL_NAME,
  description:
    'Persistent memory powered by loom. Stores and retrieves memories across sessions. ' +
    'Memories are categorized (user, project, self, feedback, reference) and semantically searchable. ' +
    'Call view("_identity") at session start to load your persistent identity.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['view', 'list', 'create', 'update', 'insert', 'delete'],
        description:
          'view — get a memory by ref (or "_identity" for identity payload); ' +
          'list — browse memories; ' +
          'create — store a new memory; ' +
          'update — modify an existing memory; ' +
          'insert — batch-store multiple memories; ' +
          'delete — remove a memory.',
      },
      ref: {
        type: 'string',
        description: 'Memory reference (category/slug) returned by create/list. Use "_identity" with view to load the loom identity.',
      },
      title: {
        type: 'string',
        description: 'Memory title (for create).',
      },
      content: {
        type: 'string',
        description: 'Memory content (for create, update).',
      },
      category: {
        type: 'string',
        enum: ['user', 'project', 'self', 'feedback', 'reference'],
        description: 'Memory category (for create, list). Defaults to "self".',
      },
      project: {
        type: 'string',
        description: 'Project scope (for create, list).',
      },
      ttl: {
        type: 'string',
        description: 'Time-to-live: "7d", "30d", "24h", or "permanent".',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (for list, default 50).',
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
        description: 'Key-value metadata to merge into the memory (for update).',
      },
      memories: {
        type: 'array',
        description: 'Batch of memories to store (for insert).',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            category: {
              type: 'string',
              enum: ['user', 'project', 'self', 'feedback', 'reference'],
            },
            project: { type: 'string' },
            ttl: { type: 'string' },
          },
          required: ['title', 'content'],
        },
      },
    },
    required: ['action'],
  },
} as const;

// ─── Seam Enforcement ─────────────────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{32,}\b/,                       // OpenAI-style API keys
  /\bAKIA[A-Z0-9]{16}\b/,                           // AWS access key IDs
  /\bghp_[A-Za-z0-9]{36,}\b/,                      // GitHub personal access tokens
  /\bghs_[A-Za-z0-9]{36,}\b/,                      // GitHub app installation tokens
  /\bBearer\s+[A-Za-z0-9._-]{20,}/i,               // Bearer / JWT tokens
  /-----BEGIN\s+(?:RSA\s+|EC\s+)?PRIVATE\s+KEY-----/, // PEM private keys
  /\w+:\/\/[^:\s/]{1,256}:[^@\s]{3,}@/,             // URLs with embedded credentials (any scheme)
  /\bpassword\s*[=:]\s*["']?[^\s"',]{8,}/i,         // password=... assignments
];

const SLEEVE_CATEGORIES = new Set([
  'todo', 'scratch', 'session', 'task', 'scratchpad',
]);

function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some(p => p.test(text));
}

function isSleeveScoped(category: string): boolean {
  return SLEEVE_CATEGORIES.has(category.toLowerCase());
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class AnthropicMemoryAdapter {
  readonly contextDir: string;

  constructor(contextDir: string) {
    this.contextDir = contextDir;
  }

  async handle(input: MemoryToolInput): Promise<string> {
    switch (input.action) {
      case 'view':   return this.view(input);
      case 'list':   return this.list(input);
      case 'create': return this.create(input);
      case 'update': return this.update(input);
      case 'insert': return this.insert(input);
      case 'delete': return this.delete(input);
    }
  }

  private backend(): MemoryBackend {
    return createBackend(this.contextDir);
  }

  private async view({ ref }: ViewInput): Promise<string> {
    if (ref === '_identity') {
      return loadIdentity(this.contextDir);
    }

    const backend = this.backend();
    // MemoryBackend has no get-by-ref; list provides metadata, recall provides content.
    const all = await backend.list({ limit: 1000 });
    const entry = all.find(e => e.ref === ref);
    if (!entry) {
      return `Memory not found: "${ref}". Use list to browse available references.`;
    }
    const matches = await backend.recall({
      query: entry.title,
      category: entry.category,
      project: entry.project,
      limit: 10,
    });
    const match = matches.find(m => m.title === entry.title);
    if (!match) {
      return `Memory metadata found (ref: ${ref}) but content could not be retrieved.`;
    }
    return formatEntry(entry.ref, entry.title, entry.category, match.content, entry.created, entry.project);
  }

  private async list({ category, project, limit }: ListInput): Promise<string> {
    const backend = this.backend();
    const entries = await backend.list({ category, project, limit: limit ?? 50 });
    if (entries.length === 0) return 'No memories found.';
    const lines = entries.map(e => {
      const scope = e.project ? ` [${e.project}]` : '';
      return `- ${e.ref}: ${e.title} (${e.category}${scope}, ${e.created.slice(0, 10)})`;
    });
    return `${entries.length} memories:\n\n${lines.join('\n')}`;
  }

  private async create({ title, content, category, project, ttl }: CreateInput): Promise<string> {
    if (containsSecret(content)) {
      return 'Refused: content appears to contain a secret or credential. Secrets must not be stored in the loom stack (spec §2 principle 5).';
    }
    if (containsSecret(title)) {
      return 'Refused: title appears to contain a secret or credential.';
    }
    if (category && isSleeveScoped(category)) {
      return `Refused: category "${category}" is sleeve-scoped. Store session-local notes in the harness, not the loom stack (spec §7).`;
    }
    const backend = this.backend();
    const ref = await backend.remember({
      title,
      content,
      category: category ?? 'self',
      project,
      ttl,
    });
    return `Memory stored: "${ref.title}" → ${ref.ref}`;
  }

  private async update({ ref, content, metadata }: UpdateInput): Promise<string> {
    if (content && containsSecret(content)) {
      return 'Refused: content appears to contain a secret or credential.';
    }
    const backend = this.backend();
    const result = await backend.update({ ref, content, metadata });
    if (!result.updated) {
      return `Memory not found: "${ref}". Use list to find the correct reference.`;
    }
    return `Memory updated: ${result.ref ?? ref}`;
  }

  private async insert({ memories }: InsertInput): Promise<string> {
    if (memories.length === 0) return 'No memories to store.';
    const backend = this.backend();
    const stored: string[] = [];
    const refused: string[] = [];

    for (const m of memories) {
      if (containsSecret(m.content) || containsSecret(m.title)) {
        refused.push(`${m.title} (secret detected)`);
        continue;
      }
      if (m.category && isSleeveScoped(m.category)) {
        refused.push(`${m.title} (sleeve-scoped category: ${m.category})`);
        continue;
      }
      const ref = await backend.remember({
        title: m.title,
        content: m.content,
        category: m.category ?? 'self',
        project: m.project,
        ttl: m.ttl,
      });
      stored.push(ref.ref);
    }

    const parts: string[] = [];
    if (stored.length > 0) {
      parts.push(`Stored ${stored.length} memories:\n${stored.map(r => `- ${r}`).join('\n')}`);
    }
    if (refused.length > 0) {
      parts.push(`Refused ${refused.length}:\n${refused.map(r => `- ${r}`).join('\n')}`);
    }
    return parts.join('\n\n');
  }

  private async delete({ ref }: DeleteInput): Promise<string> {
    const backend = this.backend();
    const result = await backend.forget({ ref });
    if (result.deleted.length === 0) {
      return `Memory not found: "${ref}". Use list to find the correct reference.`;
    }
    return `Memory deleted: ${result.deleted[0]}`;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEntry(
  ref: string,
  title: string,
  category: string,
  content: string,
  created: string,
  project?: string,
): string {
  const scope = project ? ` [${project}]` : '';
  return `## ${title}\n*${category}${scope} — ${created.slice(0, 10)}*\nRef: ${ref}\n\n${content}`;
}

// ─── Convenience Exports ──────────────────────────────────────────────────────

/** Create an adapter instance for a given loom context directory. */
export function createMemoryAdapter(contextDir: string): AnthropicMemoryAdapter {
  return new AnthropicMemoryAdapter(contextDir);
}

/**
 * One-shot handler: process a memory tool_use input and return the text
 * response to send back as a tool_result.
 */
export async function handleMemoryToolCall(
  input: MemoryToolInput,
  contextDir: string,
): Promise<string> {
  return new AnthropicMemoryAdapter(contextDir).handle(input);
}
