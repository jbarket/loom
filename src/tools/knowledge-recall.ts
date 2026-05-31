/**
 * knowledge_recall tool — LIKE search over the knowledge store.
 *
 * Stamps last_accessed and increments hit_count in a transaction on every hit
 * (handled by the backend's queryPages). Never surfaces archived pages.
 */
import { createKnowledgeBackend } from '../backends/index.js';
import type { KnowledgePageWithCitations } from '../backends/types.js';

export interface KnowledgeRecallInput {
  query?: string;
  domain?: string;
  limit?: number;
}

export function formatKnowledgePage(page: KnowledgePageWithCitations): string {
  const lines: string[] = [];
  lines.push(`## ${page.title}`);
  lines.push(`*slug: ${page.slug} | domain: ${page.domain} | sourcing: ${page.sourcing}*`);
  if (page.provenance) {
    lines.push(`*provenance: ${page.provenance}*`);
  }
  lines.push('');
  lines.push(page.body);

  if (page.citations.length > 0) {
    lines.push('');
    lines.push('**Citations:**');
    for (const c of page.citations) {
      const loc = c.source_locator ? ` — ${c.source_locator}` : '';
      lines.push(`- [${c.source_kind}${loc}] "${c.claim}" — *${c.excerpt}*`);
    }
  }

  return lines.join('\n');
}

export async function knowledgeRecall(
  contextDir: string,
  input: KnowledgeRecallInput,
): Promise<string> {
  const backend = createKnowledgeBackend(contextDir);
  let pages: KnowledgePageWithCitations[];
  try {
    pages = await backend.queryPages({
      query: input.query,
      domain: input.domain,
      excludeStatus: 'archived',
      limit: input.limit ?? 10,
    });
  } finally {
    backend.close();
  }

  if (pages.length === 0) {
    const q = input.query ? `"${input.query}"` : '(no query)';
    return `No knowledge pages found matching ${q}.`;
  }

  const formatted = pages.map(formatKnowledgePage);
  return `Found ${pages.length} knowledge page(s):\n\n${formatted.join('\n\n---\n\n')}`;
}
