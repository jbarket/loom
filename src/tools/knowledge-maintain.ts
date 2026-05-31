/**
 * knowledge_maintain tool — read-only health report for the knowledge store.
 *
 * Three branches, all report-only (no fetch, no mutation):
 *   1. Expansion candidates — thin body + high hit_count (needs deepening)
 *   2. Cold pages — no recent hits (unused/undiscovered)
 *   3. Misfile audit — provisional sourcing or all-conversation citations
 *      (should be memories, not knowledge)
 */
import { createKnowledgeBackend } from '../backends/index.js';
import type { KnowledgePageWithCitations } from '../backends/types.js';

export interface KnowledgeMaintainOptions {
  /** hit_count threshold for expansion candidates (default 3) */
  expansionHitThreshold?: number;
  /** body length (chars) below which a page is considered thin (default 500) */
  thinBodyThreshold?: number;
  /** days since last_accessed to consider cold (default 30) */
  coldDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isConversationOnly(page: KnowledgePageWithCitations): boolean {
  if (page.sourcing === 'provisional') return true;
  if (page.citations.length === 0) return false;
  return page.citations.every((c) => c.source_kind === 'conversation');
}

function isCold(page: KnowledgePageWithCitations, thresholdMs: number): boolean {
  if (page.hit_count === 0 && !page.last_accessed) return true;
  if (!page.last_accessed) return true;
  const lastMs = new Date(page.last_accessed).getTime();
  return Number.isNaN(lastMs) ? true : Date.now() - lastMs > thresholdMs;
}

export async function knowledgeMaintain(
  contextDir: string,
  options: KnowledgeMaintainOptions = {},
): Promise<string> {
  const hitThreshold = options.expansionHitThreshold ?? 3;
  const bodyThreshold = options.thinBodyThreshold ?? 500;
  const coldMs = (options.coldDays ?? 30) * DAY_MS;

  const backend = createKnowledgeBackend(contextDir);
  try {
    const pages = await backend.listPages({ limit: 1000 });

    const expansionCandidates = pages.filter(
      (p) => p.hit_count >= hitThreshold && p.body.length < bodyThreshold && p.status === 'active',
    );
    const coldPages = pages.filter(
      (p) => isCold(p, coldMs) && p.status === 'active',
    );
    const misfiled = pages.filter(
      (p) => isConversationOnly(p) && p.status === 'active',
    );

    return formatMaintainReport(pages.length, expansionCandidates, coldPages, misfiled, {
      hitThreshold,
      bodyThreshold,
      coldDays: options.coldDays ?? 30,
    });
  } finally {
    backend.close();
  }
}

function formatMaintainReport(
  total: number,
  expansion: KnowledgePageWithCitations[],
  cold: KnowledgePageWithCitations[],
  misfiled: KnowledgePageWithCitations[],
  thresholds: { hitThreshold: number; bodyThreshold: number; coldDays: number },
): string {
  const lines: string[] = [];
  lines.push('# Knowledge maintain report');
  lines.push('');
  lines.push(`**Total active pages:** ${total}`);

  // ── Expansion candidates ──────────────────────────────────────────────────
  lines.push('');
  lines.push(`## Expansion candidates (hit_count ≥ ${thresholds.hitThreshold}, body < ${thresholds.bodyThreshold} chars)`);
  lines.push('');
  if (expansion.length === 0) {
    lines.push('None — no thin but frequently-accessed pages.');
  } else {
    lines.push(`${expansion.length} page${expansion.length === 1 ? '' : 's'} are thin but frequently accessed — consider deepening:`);
    for (const p of expansion) {
      lines.push(`- \`${p.slug}\` — *${p.title}* (${p.domain}) — ${p.hit_count} hits, ${p.body.length} chars`);
    }
  }

  // ── Cold pages ────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`## Cold pages (no access in ${thresholds.coldDays}+ days, or never accessed)`);
  lines.push('');
  if (cold.length === 0) {
    lines.push('None — all active pages have been accessed recently.');
  } else {
    lines.push(`${cold.length} page${cold.length === 1 ? '' : 's'} have not been accessed recently:`);
    for (const p of cold) {
      const lastAccess = p.last_accessed ? p.last_accessed.slice(0, 10) : 'never';
      lines.push(`- \`${p.slug}\` — *${p.title}* (${p.domain}) — last access: ${lastAccess}`);
    }
  }

  // ── Misfile audit ─────────────────────────────────────────────────────────
  lines.push('');
  lines.push('## Misfile audit (provisional sourcing or conversation-only citations → candidate memories)');
  lines.push('');
  if (misfiled.length === 0) {
    lines.push('None — all active pages have independent citation support.');
  } else {
    lines.push(
      `${misfiled.length} page${misfiled.length === 1 ? '' : 's'} may belong in the memory store instead of knowledge:`,
    );
    lines.push('> **Filing test:** knowledge is true independent of Jonathan. ' +
      'If it is *about Jonathan or our work*, it belongs in memory.');
    for (const p of misfiled) {
      const reason = p.sourcing === 'provisional' ? 'provisional' : 'conversation-only citations';
      lines.push(`- \`${p.slug}\` — *${p.title}* (${p.domain}) — ${reason}`);
    }
  }

  return lines.join('\n');
}
