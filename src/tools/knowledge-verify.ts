/**
 * knowledge_verify tool — the stamp-only verification primitive.
 *
 * Sets verified_at / freshness_anchor WITHOUT touching the page body. This is
 * the primitive whose absence caused the 2026-06-01 incident: the verify role
 * had no way to stamp a page, so it pushed its notes through knowledge_write
 * and replaced 13 page bodies. An optional note appends a dated
 * "## Verification" section — append-only, never replace.
 */
import { createKnowledgeBackend } from '../backends/index.js';

export interface KnowledgeVerifyToolInput {
  slug?: string;
  slugs?: string[];
  verified_at?: string;
  freshness_anchor?: string;
  note?: string;
}

export async function knowledgeVerify(
  contextDir: string,
  input: KnowledgeVerifyToolInput,
): Promise<string> {
  const backend = createKnowledgeBackend(contextDir);
  try {
    const result = await backend.verifyPages({
      slug: input.slug,
      slugs: input.slugs,
      verified_at: input.verified_at,
      freshness_anchor: input.freshness_anchor,
      note: input.note,
    });

    const stamp = result.verified_at;
    if (result.verified === 1) {
      const extras: string[] = [];
      if (input.freshness_anchor) extras.push(`anchor → ${input.freshness_anchor}`);
      if (result.noted) extras.push('note appended');
      const suffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';
      return `Verified \`${result.slugs[0]}\` — verified_at stamped to ${stamp}${suffix}. Body untouched${result.noted ? ' except appended note' : ''}.`;
    }
    return `Verified ${result.verified} page(s) — verified_at stamped to ${stamp}: ${result.slugs.map((s) => `\`${s}\``).join(', ')}. Bodies untouched.`;
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  } finally {
    backend.close();
  }
}
