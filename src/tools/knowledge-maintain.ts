/**
 * knowledge_maintain tool — read-only maintenance report for the knowledge store.
 *
 * Report-only: never mutates. Surfaces three signal types:
 *   - Expansion candidates: thin body + high hit_count
 *   - Cold pages: no recent access
 *   - Misfile audit: pages whose only citation support is conversation-sourced
 */
import { createKnowledgeBackend } from '../backends/index.js';
import type { KnowledgeMaintainOptions, KnowledgeMaintainReport } from '../backends/types.js';

export function formatMaintainReport(report: KnowledgeMaintainReport): string {
  const lines: string[] = [];
  lines.push('# Knowledge maintenance report');
  lines.push('');

  // Expansion candidates
  lines.push(`**Expansion candidates** (thin + frequently accessed): ${report.expansionCandidates.length}`);
  for (const c of report.expansionCandidates) {
    lines.push(`- \`${c.slug}\` — *${c.title}* [${c.domain}] (${c.bodyLength} chars, ${c.hitCount} hits)`);
  }

  lines.push('');

  // Cold pages
  lines.push(`**Cold pages** (no recent access): ${report.coldPages.length}`);
  for (const p of report.coldPages) {
    const lastSeen = p.lastAccessed ? p.lastAccessed.slice(0, 10) : 'never';
    lines.push(`- \`${p.slug}\` — *${p.title}* [${p.domain}] (last accessed: ${lastSeen}, hits: ${p.hitCount})`);
  }

  lines.push('');

  // Misfile audit
  lines.push(`**Misfile audit** (conversation-only citations — likely memories): ${report.misfileAudit.length}`);
  for (const m of report.misfileAudit) {
    lines.push(`- \`${m.slug}\` — *${m.title}* [${m.domain}]`);
  }

  return lines.join('\n');
}

export async function knowledgeMaintain(
  contextDir: string,
  options?: KnowledgeMaintainOptions,
): Promise<string> {
  const backend = createKnowledgeBackend(contextDir);
  let report: KnowledgeMaintainReport;
  try {
    report = await backend.maintain(options);
  } finally {
    backend.close();
  }
  return formatMaintainReport(report);
}
