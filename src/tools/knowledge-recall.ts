/**
 * knowledge_recall tool — LIKE search over the knowledge store.
 *
 * Stamps last_accessed and increments hit_count in a transaction on every
 * hit (via queryPages — the usage signal the Phase-4 expansion engine depends
 * on). Never surfaces archived pages.
 */
import { createKnowledgeBackend } from '../backends/index.js';
import type { KnowledgePageWithCitations } from '../backends/types.js';

export interface KnowledgeRecallInput {
  query?: string;
  domain?: string;
  limit?: number;
}

function formatPage(page: KnowledgePageWithCitations): string {
  const lines: string[] = [];
  lines.push(`## ${page.title}`);
  lines.push(`**Slug:** \`${page.slug}\` | **Domain:** ${page.domain} | **Sourcing:** ${page.sourcing}`);
  if (page.sourcing === 'provisional') {
    lines.push('> ⚠️ Provisional — needs independent citation to be sourced.');
  }
  if (page.provenance) {
    lines.push(`> Provenance: ${page.provenance}`);
  }
  lines.push('');
  lines.push(page.body);
  if (page.citations.length > 0) {
    lines.push('');
    lines.push('**Citations:**');
    for (const cit of page.citations) {
      const loc = cit.source_locator ? ` (${cit.source_locator})` : '';
      lines.push(`- [${cit.source_kind}${loc}] *${cit.claim}* — "${cit.excerpt}"`);
    }
  }
  return lines.join('\n');
}

export async function knowledgeRecall(
  contextDir: string,
  input: KnowledgeRecallInput,
): Promise<string> {
  const backend = createKnowledgeBackend(contextDir);
  try {
    const pages = await backend.queryPages({
      query: input.query,
      domain: input.domain,
      excludeStatus: 'archived',
      limit: input.limit ?? 10,
    });

    if (pages.length === 0) {
      const q = input.query ? `"${input.query}"` : '(no query)';
      return `No knowledge pages found for ${q}.`;
    }

    const parts = pages.map(formatPage);
    return `# Knowledge recall — ${pages.length} result${pages.length === 1 ? '' : 's'}\n\n${parts.join('\n\n---\n\n')}`;
  } finally {
    backend.close();
  }
}
