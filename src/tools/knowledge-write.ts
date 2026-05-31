/**
 * knowledge_write tool — upsert an entity page by slug/title.
 *
 * Enforces the epistemic gate (§E1): a page whose ONLY citation support is
 * source_kind="conversation" is stored as `provisional`, never `sourced`.
 * Filing test: knowledge is true independent of Jonathan; if it's about
 * Jonathan / our work, it belongs in the memory store.
 */
import { createKnowledgeBackend } from '../backends/index.js';

export interface KnowledgeWriteInput {
  domain: string;
  title: string;
  body: string;
  slug?: string;
  citations: Array<{
    claim: string;
    source_kind: 'web' | 'loom_memory' | 'conversation';
    source_locator?: string;
    excerpt: string;
  }>;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
}

/** §E1: conversation-only citations → provisional. */
function determineSourcing(
  citations: KnowledgeWriteInput['citations'],
): 'sourced' | 'provisional' {
  if (citations.length === 0) return 'provisional';
  return citations.every((c) => c.source_kind === 'conversation') ? 'provisional' : 'sourced';
}

export async function knowledgeWrite(
  contextDir: string,
  input: KnowledgeWriteInput,
): Promise<string> {
  if (input.citations.length === 0) {
    return (
      'Error: at least one citation is required — knowledge must be supported. ' +
      'If this is a conversation-distilled insight, pass source_kind="conversation" ' +
      'and the page will be stored provisional.'
    );
  }

  const slug = input.slug ?? slugify(input.title);
  if (!slug) {
    return 'Error: could not derive a slug from the title. Provide an explicit slug.';
  }

  const sourcing = determineSourcing(input.citations);
  const backend = createKnowledgeBackend(contextDir);
  try {
    const result = await backend.writePage({
      slug,
      title: input.title,
      domain: input.domain,
      body: input.body,
      sourcing,
      citations: input.citations,
    });

    const sourcingNote =
      sourcing === 'provisional'
        ? '\n> **Provisional** — sole support is conversation citations. ' +
          'Add a web or loom_memory citation to promote to sourced.'
        : '';

    return (
      `Knowledge page written: **${result.title}** (\`${result.slug}\`)\n` +
      `Domain: ${input.domain} | Citations added: ${result.citationsAdded} | Sourcing: ${sourcing}` +
      sourcingNote
    );
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  } finally {
    backend.close();
  }
}
