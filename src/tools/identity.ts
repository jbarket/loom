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
import { readFile, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { loadClientAdapter } from '../clients.js';
import * as harnessBlock from '../blocks/harness.js';
import * as modelBlock from '../blocks/model.js';
import * as proceduresBlock from '../blocks/procedures.js';
import { debugLog } from '../logging.js';
import { resolveFastEmbedCacheDir, resolveFastEmbedModel } from '../config.js';
import { LOOM_E_MISSING_MANIFEST } from '../errors.js';

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function byteSize(path: string): Promise<number> {
  try {
    const s = await stat(path);
    return s.size;
  } catch {
    return 0;
  }
}

/** Check whether the fastembed model ONNX files are present in the cache. */
async function isFastEmbedCached(model: string): Promise<boolean> {
  const cacheDir = resolveFastEmbedCacheDir() ?? join(homedir(), '.cache', 'loom', 'fastembed');
  const modelDir = resolve(cacheDir, model);
  try {
    const entries = await readdir(modelDir);
    return entries.some((f) => f.endsWith('.onnx'));
  } catch {
    return false;
  }
}

// ─── Verbose stats ────────────────────────────────────────────────────────────

export interface SectionStat {
  name: string;
  present: boolean;
  bytes: number;
  ms: number;
}

export interface IdentityLoadStats {
  sections: SectionStat[];
  totalBytes: number;
  totalMs: number;
  warnings: IdentityWarning[];
}

export interface IdentityWarning {
  code: string;
  message: string;
}

// ─── Core loader ─────────────────────────────────────────────────────────────

export async function loadIdentity(
  contextDir: string,
  project?: string,
  client?: string,
  model?: string,
  onStats?: (stats: IdentityLoadStats) => void,
): Promise<string> {
  const parts: string[] = [];
  const stats: SectionStat[] = [];
  const warnings: IdentityWarning[] = [];
  const effectiveClient = client ?? process.env.LOOM_CLIENT;
  const effectiveModel = model ?? process.env.LOOM_MODEL;
  const loadStart = Date.now();

  async function loadSection<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<{ value: T; ms: number }> {
    const t0 = Date.now();
    debugLog('identity', `loading section: ${name}`);
    const value = await fn();
    const ms = Date.now() - t0;
    debugLog('identity', `section done: ${name}`, { ms });
    return { value, ms };
  }

  // Terminal creed — the immutable identity
  {
    const path = join(contextDir, 'IDENTITY.md');
    const { value: creed, ms } = await loadSection('creed', () => readOptional(path));
    const bytes = creed ? Buffer.byteLength(creed, 'utf-8') : 0;
    stats.push({ name: 'creed', present: Boolean(creed), bytes, ms });
    if (creed) {
      parts.push('# Identity\n\n' + creed.trim());
    } else {
      parts.push(
        '# Identity\n\n' +
        '*No IDENTITY.md found. Create one in your context directory to define who this agent is.*'
      );
    }
  }

  // Preferences — how the user likes to work
  {
    const path = join(contextDir, 'preferences.md');
    const { value: preferences, ms } = await loadSection('preferences', () => readOptional(path));
    const bytes = preferences ? Buffer.byteLength(preferences, 'utf-8') : 0;
    stats.push({ name: 'preferences', present: Boolean(preferences), bytes, ms });
    if (preferences) {
      parts.push('# Preferences\n\n' + preferences.trim());
    }
  }

  // Self-model — what the agent knows about its own capabilities
  {
    const path = join(contextDir, 'self-model.md');
    const { value: selfModel, ms } = await loadSection('self-model', () => readOptional(path));
    const bytes = selfModel ? Buffer.byteLength(selfModel, 'utf-8') : 0;
    stats.push({ name: 'self-model', present: Boolean(selfModel), bytes, ms });
    if (selfModel) {
      parts.push('# Self-Model\n\n' + selfModel.trim());
    }
  }

  // Project-specific context
  if (project) {
    const path = join(contextDir, 'projects', `${project}.md`);
    const { value: projectBrief, ms } = await loadSection(`project:${project}`, () => readOptional(path));
    const bytes = projectBrief ? Buffer.byteLength(projectBrief, 'utf-8') : 0;
    stats.push({ name: `project:${project}`, present: Boolean(projectBrief), bytes, ms });
    if (projectBrief) {
      parts.push(`# Project: ${project}\n\n` + projectBrief.trim());
    }
  }

  // Harness manifest — the shape of the current runtime (stack spec §4.7).
  if (effectiveClient) {
    const { value: block, ms } = await loadSection(`harness:${effectiveClient}`, () =>
      harnessBlock.read(contextDir, effectiveClient!)
    );
    const bytes = block ? Buffer.byteLength(block.body, 'utf-8') : 0;
    stats.push({ name: `harness:${effectiveClient}`, present: Boolean(block), bytes, ms });
    if (block) {
      parts.push(`# Harness: ${effectiveClient}\n\n${block.body}`);
    } else {
      parts.push(
        `# Harness: ${effectiveClient} (manifest missing)\n\n` +
        `No manifest found at ${contextDir}/harnesses/${effectiveClient}.md. ` +
        `Write one — here's the template:\n\n` +
        harnessBlock.template(effectiveClient),
      );
      warnings.push({
        code: LOOM_E_MISSING_MANIFEST,
        message: `Harness manifest for "${effectiveClient}" not found. Run \`harness_init("${effectiveClient}")\` to scaffold one.`,
      });
    }
  }

  // Model manifest — model-family-specific capability notes (stack spec §4.8).
  if (effectiveModel) {
    const { value: block, ms } = await loadSection(`model:${effectiveModel}`, () =>
      modelBlock.read(contextDir, effectiveModel!)
    );
    const bytes = block ? Buffer.byteLength(block.body, 'utf-8') : 0;
    stats.push({ name: `model:${effectiveModel}`, present: Boolean(block), bytes, ms });
    if (block) {
      parts.push(`# Model: ${effectiveModel}\n\n${block.body}`);
    } else {
      parts.push(
        `# Model: ${effectiveModel} (manifest missing)\n\n` +
        `No manifest found at ${contextDir}/models/${effectiveModel}.md. ` +
        `Write one — here's the template:\n\n` +
        modelBlock.template(effectiveModel),
      );
      warnings.push({
        code: LOOM_E_MISSING_MANIFEST,
        message: `Model manifest for "${effectiveModel}" not found. Write models/${effectiveModel}.md.`,
      });
    }
  }

  // Procedures — procedural-identity docs (stack spec §4.9).
  {
    const { value: { blocks: procedures, capWarning }, ms } = await loadSection('procedures', () =>
      proceduresBlock.readAll(contextDir)
    );
    const totalBytes = procedures.reduce((n, b) => n + Buffer.byteLength(b.body, 'utf-8'), 0);
    stats.push({ name: 'procedures', present: procedures.length > 0, bytes: totalBytes, ms });
    if (procedures.length > 0) {
      const body = procedures.map((b) => b.body).join('\n\n---\n\n');
      const withWarning = capWarning ? `> ${capWarning}\n\n${body}` : body;
      parts.push(`# Procedures\n\n${withWarning}`);
    } else {
      parts.push(proceduresBlock.seedNudge());
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

  // ─── Diagnostics: fastembed cache check ─────────────────────────────────────
  const embedModel = resolveFastEmbedModel();
  const embedCached = await isFastEmbedCached(embedModel);
  if (!embedCached) {
    warnings.push({
      code: 'LOOM_E_EMBED_NOT_CACHED',
      message: `FastEmbed model "${embedModel}" not yet downloaded. First recall/remember will trigger a ~30 MB download.`,
    });
  }

  // ─── Warnings section ────────────────────────────────────────────────────────
  if (warnings.length > 0) {
    const warnLines = warnings.map((w) => `- **${w.code}** — ${w.message}`).join('\n');
    parts.push(`# ⚠ Diagnostics\n\n${warnLines}`);
    debugLog('identity', `${warnings.length} warning(s) collected`, {
      codes: warnings.map((w) => w.code),
    });
  }

  const totalMs = Date.now() - loadStart;
  const totalBytes = stats.reduce((n, s) => n + s.bytes, 0);
  debugLog('identity', 'load complete', { totalMs, totalBytes, sections: stats.length });

  if (onStats) {
    onStats({ sections: stats, totalBytes, totalMs, warnings });
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
