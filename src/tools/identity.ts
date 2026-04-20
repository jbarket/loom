/**
 * Identity tool — loads the terminal creed, memories, preferences, and self-model.
 *
 * This is the core of System 3. When an agent calls this tool, it receives
 * everything it needs to become a persistent identity. The creed is immutable.
 * Memories, preferences, and self-model evolve across sessions.
 *
 * The response is structured text that the agent incorporates into its context.
 * The agent doesn't need to understand the structure — it just reads and follows.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadClientAdapter } from '../clients.js';
import * as harnessBlock from '../blocks/harness.js';

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

export async function loadIdentity(contextDir: string, project?: string, client?: string): Promise<string> {
  const parts: string[] = [];
  const effectiveClient = client ?? process.env.LOOM_CLIENT;

  // Terminal creed — the immutable identity
  const creed = await readOptional(join(contextDir, 'IDENTITY.md'));
  if (creed) {
    parts.push('# Identity\n\n' + creed.trim());
  } else {
    parts.push(
      '# Identity\n\n' +
      '*No IDENTITY.md found. Create one in your context directory to define who this agent is.*'
    );
  }

  // Preferences — how the user likes to work
  const preferences = await readOptional(join(contextDir, 'preferences.md'));
  if (preferences) {
    parts.push('# Preferences\n\n' + preferences.trim());
  }

  // Self-model — what the agent knows about its own capabilities
  const selfModel = await readOptional(join(contextDir, 'self-model.md'));
  if (selfModel) {
    parts.push('# Self-Model\n\n' + selfModel.trim());
  }

  // Project-specific context
  if (project) {
    const projectBrief = await readOptional(join(contextDir, 'projects', `${project}.md`));
    if (projectBrief) {
      parts.push(`# Project: ${project}\n\n` + projectBrief.trim());
    }
  }

  // Harness manifest — the shape of the current runtime (stack spec §4.7).
  if (effectiveClient) {
    const block = await harnessBlock.read(contextDir, effectiveClient);
    if (block) {
      parts.push(`# Harness: ${effectiveClient}\n\n${block.body}`);
    } else {
      parts.push(
        `# Harness: ${effectiveClient} (manifest missing)\n\n` +
        `No manifest found at ${contextDir}/harnesses/${effectiveClient}.md. ` +
        `Write one — here's the template:\n\n` +
        harnessBlock.template(effectiveClient),
      );
    }
  }

  // Optional recent-memory summary. The memory store of record is
  // memories.db (sqlite-vec); navigate it via recall(). If a legacy
  // memories/INDEX.md sidecar exists from FS-backend days, surface a
  // brief summary as a hint — full content lives in the DB.
  const memoryIndex = await readOptional(join(contextDir, 'memories', 'INDEX.md'));
  if (memoryIndex) {
    parts.push('# Memories\n\n' + summarizeMemoryIndex(memoryIndex));
  }

  // Runtime-specific context (tool name prefix, notes) — legacy `## Runtime:` block.
  if (effectiveClient) {
    const adapter = await loadClientAdapter(contextDir, effectiveClient);
    if (adapter) {
      parts.push(adapter);
    }
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Produce a compact summary of a legacy memories/INDEX.md sidecar. The
 * DB is the source of truth; this only surfaces a hint when an old
 * filesystem-era index still exists in the context dir.
 */
function summarizeMemoryIndex(index: string): string {
  const lines = index.split('\n').filter((l) => l.trim().startsWith('- '));

  // Count by type tag e.g. [project], [feedback], [reference], [user], [self]
  const counts: Record<string, number> = {};
  for (const line of lines) {
    const match = line.match(/\[(\w+)\]/);
    if (match) {
      const type = match[1];
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }

  const total = lines.length;
  const countStr = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');

  // Show last 5 entries as a recent-activity signal
  const recent = lines.slice(-5).map((l) => l.trim()).join('\n');

  return (
    `${total} memories stored (${countStr || 'various types'}).\n` +
    `Use \`recall()\` to search by relevance.\n\n` +
    `**Recent:**\n${recent}`
  );
}
