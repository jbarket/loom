/**
 * Memory import tool — load memories from newline-delimited JSON.
 *
 * Upserts by ref: if a memory with that ref exists, updates content/metadata
 * and re-embeds only when something changed. If not, inserts with the
 * original ref and timestamps preserved. Idempotent: importing the same
 * JSONL twice produces no changes on the second run.
 */
import { createBackend } from '../backends/index.js';
import type { MemoryExportEntry, ImportResult } from '../backends/types.js';

export function parseJsonl(text: string): MemoryExportEntry[] {
  return text
    .split('\n')
    .map((line, i) => ({ line: line.trim(), lineNum: i + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNum }) => {
      try {
        return JSON.parse(line) as MemoryExportEntry;
      } catch {
        throw new Error(`Invalid JSON on line ${lineNum}: ${line.slice(0, 80)}`);
      }
    });
}

export async function memoryImport(
  contextDir: string,
  entries: MemoryExportEntry[],
): Promise<ImportResult> {
  const backend = createBackend(contextDir);
  return backend.import(entries);
}
