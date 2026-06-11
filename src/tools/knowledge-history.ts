/**
 * knowledge_history tool — body-revision listing, inspection, and restore.
 *
 * Replace-writes snapshot the displaced body into page_revisions (capped per
 * page, newest kept). This tool is the recovery surface: list a page's
 * snapshots, read one, or restore one. A restore snapshots the body it
 * displaces — restoring is never itself a destructive overwrite.
 */
import { createKnowledgeBackend } from '../backends/index.js';

export interface KnowledgeHistoryToolInput {
  slug: string;
  revision_id?: number;
  restore?: boolean;
}

export async function knowledgeHistory(
  contextDir: string,
  input: KnowledgeHistoryToolInput,
): Promise<string> {
  if (!input.slug) {
    return 'Error: slug is required.';
  }
  if (input.restore && input.revision_id === undefined) {
    return 'Error: restore requires a revision_id — list revisions first to pick one.';
  }

  const backend = createKnowledgeBackend(contextDir);
  try {
    // ── Restore mode ──
    if (input.restore && input.revision_id !== undefined) {
      const result = await backend.restoreRevision({
        slug: input.slug,
        revision_id: input.revision_id,
      });
      return (
        `Restored revision #${result.revision_id} onto \`${result.slug}\`. ` +
        `The displaced body was snapshotted as revision #${result.snapshot_id}.`
      );
    }

    // ── Read mode ──
    if (input.revision_id !== undefined) {
      const revision = await backend.getRevision(input.revision_id);
      if (!revision) {
        return `Error: revision not found: ${input.revision_id}`;
      }
      return (
        `# Revision #${revision.id} of \`${revision.slug}\`\n` +
        `op: ${revision.op} | replaced: ${revision.replaced_at}\n\n` +
        `${revision.body}\n\n` +
        `_Pass restore: true to put this body back on the page._`
      );
    }

    // ── List mode ──
    const revisions = await backend.listRevisions(input.slug);
    if (revisions.length === 0) {
      return `\`${input.slug}\` has no revisions — its body has never been replaced.`;
    }
    const lines = revisions.map(
      (r) => `- **#${r.id}** | ${r.op} | replaced ${r.replaced_at} | ${r.body_length} chars`,
    );
    return (
      `# Revision history — \`${input.slug}\` — ${revisions.length} snapshot(s)\n\n` +
      `${lines.join('\n')}\n\n` +
      `_Pass revision_id to read a snapshot; add restore: true to put it back._`
    );
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  } finally {
    backend.close();
  }
}
