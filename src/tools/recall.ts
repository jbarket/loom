/**
 * Recall tool — retrieves memories relevant to a query.
 *
 * Delegates to the configured memory backend for search, then formats
 * results for display. The backend handles the actual search strategy
 * (keyword, vector, etc.).
 */
import { createBackend } from '../backends/index.js';
import type { RecallInput, MemoryMatch } from '../backends/types.js';



export function formatMatchResult(m: MemoryMatch): string {
  const projectTag = m.project ? ` [${m.project}]` : '';
  return `## ${m.title}\n*${m.category}${projectTag} — ${m.created.slice(0, 10)}*\n\n${m.content}`;
}

export function formatResults(matches: MemoryMatch[]): string {
  const results = matches.map(formatMatchResult);
  return `Found ${matches.length} matching memories:\n\n${results.join('\n\n---\n\n')}`;
}

export async function recall(
  contextDir: string,
  input: RecallInput,
): Promise<string> {
  const backend = createBackend(contextDir);
  const matches = await backend.recall(input);

  if (matches.length === 0) {
    return `No memories found matching "${input.query}".`;
  }

  return formatResults(matches);
}
