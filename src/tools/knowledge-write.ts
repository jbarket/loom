/**
 * knowledge_write tool — upsert a knowledge entity page by slug.
 *
 * Enforces the epistemic gate: a page whose only citation support is
 * source_kind='conversation' is stored 'provisional', not 'sourced'.
 * Caller wraps backend.close() in finally (see server.ts registration).
 */
import { createKnowledgeBackend } from '../backends/index.js';
import type { KnowledgePageInput, KnowledgeCitationInput, KnowledgeWriteResult } from '../backends/types.js';

export interface KnowledgeWriteInput {
  slug?: string;
  title: string;
  domain: string;
  body: string;
  sourcing?: 'sourced' | 'provisional';
  provenance?: string;
  citations?: KnowledgeCitationInput[];
}

/** Derive a URL-safe slug from a title if none supplied. */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Epistemic gate (§E1): if ALL provided citations are conversation-sourced,
 * force sourcing to 'provisional' regardless of what the caller requested.
 */
export function deriveSourced(input: KnowledgeWriteInput): 'sourced' | 'provisional' {
  const cits = input.citations ?? [];
  if (cits.length > 0 && cits.every((c) => c.source_kind === 'conversation')) {
    return 'provisional';
  }
  return input.sourcing ?? 'sourced';
}

export async function knowledgeWrite(
  contextDir: string,
  input: KnowledgeWriteInput,
): Promise<string> {
  const slug = input.slug ?? titleToSlug(input.title);
  const sourcing = deriveSourced(input);

  const pageInput: KnowledgePageInput = {
    slug,
    title: input.title,
    domain: input.domain,
    body: input.body,
    sourcing,
    provenance: input.provenance,
    citations: input.citations,
  };

  const backend = createKnowledgeBackend(contextDir);
  let result: KnowledgeWriteResult;
  try {
    result = await backend.writePage(pageInput);
  } finally {
    backend.close();
  }

  const sourcingNote = result.sourcing === 'provisional'
    ? ' (stored provisional — all citations are conversation-sourced)'
    : '';
  const citNote = result.citationsAdded > 0
    ? ` ${result.citationsAdded} citation(s) added.`
    : '';

  return `Knowledge page written: "${result.title}" (slug: ${result.slug}, uuid: ${result.uuid})${sourcingNote}.${citNote}`;
}
