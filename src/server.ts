/**
 * Loom — MCP Server Factory
 *
 * Creates a McpServer with the core identity and memory tools registered.
 * This is the portable identity layer — no routing, no orchestration,
 * no chat clients. Just the tools that carry a persistent persona across
 * any MCP-compatible runtime.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CURRENT_STACK_VERSION, ensureStackVersion, readStackVersion, STACK_VERSION_FILE } from './config.js';
import { loadIdentity } from './tools/identity.js';
import { remember } from './tools/remember.js';
import { recall } from './tools/recall.js';
import { update } from './tools/update.js';
import { forget } from './tools/forget.js';
import { prune } from './tools/prune.js';
import { memoryList } from './tools/memory-list.js';
import { updateIdentity } from './tools/update-identity.js';
import { pursuits } from './tools/pursuits.js';
import { bootstrap } from './tools/bootstrap.js';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface LoomServerConfig {
  contextDir: string;
}

export interface LoomServerInstance {
  server: McpServer;
}

// ─── Server Factory ───────────────────────────────────────────────────────────

export function createLoomServer(config: LoomServerConfig): LoomServerInstance {
  const { contextDir } = config;

  // Refuse to boot against a stack this loom build doesn't understand.
  const onDisk = readStackVersion(contextDir);
  if (onDisk !== null) {
    if (Number.isNaN(onDisk)) {
      throw new Error(
        `LOOM_STACK_VERSION unparseable at ${contextDir}/${STACK_VERSION_FILE}. ` +
        `Expected an integer; got raw content.`,
      );
    }
    if (onDisk > CURRENT_STACK_VERSION) {
      throw new Error(
        `loom understands stack version ${CURRENT_STACK_VERSION} but found ` +
        `stack version ${onDisk} at ${contextDir}/${STACK_VERSION_FILE}. ` +
        `Upgrade loom or pin LOOM_CONTEXT_DIR to an older stack.`,
      );
    }
  }
  ensureStackVersion(contextDir);

  const server = new McpServer({
    name: 'loom',
    version: '0.4.0-alpha.1', // Keep in sync with package.json
  });

  // ─── Identity ───────────────────────────────────────────────────────────────

  server.tool(
    'identity',
    'Load the persistent identity for this agent. Returns the terminal creed ' +
    '(who you are), relevant memories, preferences, and self-model. ' +
    'IMPORTANT: Call this tool FIRST before doing any other work. ' +
    'The identity defines who you are and how you should behave.',
    {
      project: z.string().optional().describe('Project context to load (loads project-specific memories)'),
      client: z.string().optional().describe(
        'Runtime client name for tool-prefix context: "claude-code", "gemini-cli", "hermes", "openclaw", "nemoclaw". ' +
        'Overrides the LOOM_CLIENT environment variable.',
      ),
      model: z.string().optional().describe(
        'Model identifier for model-manifest context (e.g. "claude-opus", "gemma4"). ' +
        'Overrides the LOOM_MODEL environment variable.',
      ),
    },
    async ({ project, client, model }) => {
      const result = await loadIdentity(contextDir, project, client, model);
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  // ─── Memory ─────────────────────────────────────────────────────────────────

  server.tool(
    'remember',
    'Store an episodic memory that persists across sessions. Use this when you ' +
    'learn something important about the user, a project, or yourself that ' +
    'should be available in future sessions.',
    {
      category: z.enum(['user', 'project', 'self', 'feedback', 'reference']).describe(
        'Memory category: user (about the human), project (about work), self (capability/learning), feedback (corrections/confirmations), reference (external pointers)'
      ),
      title: z.string().describe('Short title for the memory'),
      content: z.string().describe('The memory content — what you learned, observed, or were told'),
      project: z.string().optional().describe('Associated project, if any (omit for global memories)'),
      metadata: z.record(z.string(), z.unknown()).optional().describe('Arbitrary key-value metadata'),
      ttl: z.string().optional().describe(
        'Time-to-live: "7d", "30d", "24h", "permanent", or omit for no expiration.'
      ),
    },
    async ({ category, title, content, project, metadata, ttl }) => {
      const ref = await remember(contextDir, { category, title, content, project, metadata, ttl });
      return { content: [{ type: 'text' as const, text: `Memory stored: "${ref.title}" → ${ref.ref}` }] };
    },
  );

  server.tool(
    'recall',
    'Retrieve memories relevant to a query or topic. Returns matching memories ' +
    'from the persistent store. Use this when you need context from past sessions.',
    {
      query: z.string().describe('What to search for — topic, keyword, or question'),
      category: z.string().optional().describe('Filter to a specific memory category, or omit for all'),
      project: z.string().optional().describe('Filter to a specific project'),
      limit: z.number().optional().describe('Maximum results to return (default: 10)'),
    },
    async ({ query, category, project, limit }) => {
      const result = await recall(contextDir, { query, category, project, limit });
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'update',
    'Update an existing memory. Find by ref (returned from remember) or by ' +
    'category+title. Can replace content, update metadata, or both.',
    {
      ref: z.string().optional().describe('Memory reference (category/filename) from remember'),
      category: z.string().optional().describe('Category to search in (used with title)'),
      title: z.string().optional().describe('Title of the memory to update (used with category)'),
      content: z.string().optional().describe('New content (replaces existing body)'),
      metadata: z.record(z.string(), z.unknown()).optional().describe('Metadata fields to add or update'),
    },
    async ({ ref, category, title, content, metadata }) => {
      const result = await update(contextDir, { ref, category, title, content, metadata });
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'forget',
    'Remove memories. Single deletion by ref or category+title. ' +
    'Bulk deletion by category and/or project scope.',
    {
      ref: z.string().optional().describe('Memory reference for single deletion'),
      category: z.string().optional().describe('Category (with title for single, alone for bulk)'),
      title: z.string().optional().describe('Title of specific memory to forget'),
      project: z.string().optional().describe('Delete all memories for this project (bulk)'),
      title_pattern: z.string().optional().describe('Glob pattern for bulk title matching. Requires category or project as scope guard.'),
    },
    async ({ ref, category, title, project, title_pattern }) => {
      const result = await forget(contextDir, { ref, category, title, project, title_pattern });
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'memory_prune',
    'Remove expired memories (TTL elapsed). Use dry_run to preview without deleting.',
    {
      dry_run: z.boolean().optional().describe('Preview only — show what would be pruned without deleting (default: false)'),
      stale_days: z.number().optional().describe('Days since last access to consider a memory stale (default: 30)'),
    },
    async ({ dry_run, stale_days }) => {
      const result = await prune(contextDir, { dryRun: dry_run, staleDays: stale_days });
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'memory_list',
    'Browse memories without semantic search. Lists memories with optional ' +
    'category/project filters. Useful for auditing, maintenance, and discovery.',
    {
      category: z.string().optional().describe('Filter to a specific category'),
      project: z.string().optional().describe('Filter to a specific project'),
      limit: z.number().optional().describe('Maximum results (default: 50)'),
    },
    async ({ category, project, limit }) => {
      const result = await memoryList(contextDir, { category, project, limit });
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  // ─── Identity Update ────────────────────────────────────────────────────────

  server.tool(
    'update_identity',
    'Update your self-model or preferences with section-level precision. ' +
    'Targets H2 sections in identity files. Call without section/content to ' +
    'list available sections. IDENTITY.md (the creed) is immutable — only ' +
    'self-model and preferences can be edited.',
    {
      file: z.enum(['self-model', 'preferences']).describe(
        'Which identity file to update: "self-model" or "preferences"'
      ),
      section: z.string().optional().describe(
        'H2 section name to target. Omit to list all sections.'
      ),
      content: z.string().optional().describe(
        'New content for the section (replaces everything under the H2 header)'
      ),
      mode: z.enum(['replace', 'append']).optional().describe(
        '"replace" updates an existing section (default), "append" adds a new section'
      ),
    },
    async ({ file, section, content, mode }) => {
      const result = await updateIdentity(contextDir, { file, section, content, mode });
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  // ─── Bootstrap ──────────────────────────────────────────────────────────────

  server.tool(
    'bootstrap',
    'Initialize a new loom identity from scratch. Generates IDENTITY.md, preferences.md, ' +
    'and self-model.md from an onboarding interview, then returns setup instructions for ' +
    'the requested runtimes. Will not overwrite existing files unless force is true.',
    {
      name: z.string().describe('Name for the agent identity (e.g. "Art E Fish")'),
      purpose: z.string().describe('What this agent exists to do — its reason for being'),
      voice: z.string().describe('Communication style and personality'),
      preferences: z.string().optional().describe('Seed preferences about the user or working style'),
      clients: z.array(z.string()).optional().describe(
        'Runtimes to generate setup instructions for: "claude-code", "gemini-cli", "hermes", "openclaw", "nemoclaw"'
      ),
      force: z.boolean().optional().describe('Overwrite existing identity files (default: false)'),
    },
    async ({ name, purpose, voice, preferences, clients, force }) => {
      const result = await bootstrap(contextDir, { name, purpose, voice, preferences, clients, force });
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  // ─── Pursuits ───────────────────────────────────────────────────────────────

  server.tool(
    'pursuits',
    'Manage active interests, creative threads, and personal goals. ' +
    'Pursuits track what you\'re working on and provide continuity across sessions.',
    {
      action: z.enum(['add', 'update', 'complete', 'park', 'resume', 'list']).describe(
        'add, update, complete, park, resume, or list'
      ),
      name: z.string().optional().describe('Name of the pursuit'),
      goal: z.string().optional().describe('Goal for a new pursuit'),
      progress: z.string().optional().describe('Progress note for update/resume'),
      reason: z.string().optional().describe('Reason for completing or parking'),
    },
    async ({ action, name, goal, progress, reason }) => {
      const result = await pursuits(contextDir, { action, name, goal, progress, reason });
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  return { server };
}
