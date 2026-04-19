/**
 * Forget tool — removes memories by reference or by scope (category/project).
 *
 * Delegates to the configured memory backend for deletion.
 */
import { createBackend } from '../backends/index.js';
import type { ForgetInput } from '../backends/types.js';



export async function forget(
  contextDir: string,
  input: ForgetInput,
): Promise<string> {
  const isSingle = input.ref || (input.category && input.title && !input.title_pattern);
  const isPatternBulk = !!input.title_pattern && (input.category || input.project);
  const isBulk = !isSingle && (input.category || input.project);

  if (input.title_pattern && !input.category && !input.project) {
    return 'title_pattern requires category or project as a scope guard. Provide at least one.';
  }

  if (!isSingle && !isBulk) {
    return 'Nothing to forget. Provide a ref, category+title, or a scope (category/project) for bulk deletion.';
  }

  const backend = createBackend(contextDir);
  const result = await backend.forget(input);

  // Single deletion
  if (isSingle) {
    if (result.deleted.length === 0) {
      const identifier = input.ref ?? `${input.category}/${input.title}`;
      return `Memory not found: "${identifier}". Use recall to find the correct reference.`;
    }
    return `Memory forgotten: ${result.deleted[0]}`;
  }

  // Bulk deletion (including pattern-based)
  if (result.deleted.length === 0) {
    const desc = isPatternBulk
      ? `No memories matched pattern "${input.title_pattern}".`
      : 'No memories matched the given scope.';
    return desc;
  }
  return `Forgot ${result.deleted.length} memories:\n${result.deleted.map(r => `- ${r}`).join('\n')}`;
}
