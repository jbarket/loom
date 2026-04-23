/**
 * Memory export tool — emit memories as newline-delimited JSON.
 *
 * Each line is a JSON object containing all fields needed to reconstruct
 * the memory in a fresh context dir. Used for portability, embedding-model
 * migration, disaster recovery, and sharing memory sets between agents.
 */
import { createBackend } from '../backends/index.js';
import type { ExportInput, MemoryExportEntry } from '../backends/types.js';

export async function memoryExport(
  contextDir: string,
  input: ExportInput,
): Promise<MemoryExportEntry[]> {
  const backend = createBackend(contextDir);
  return backend.export(input);
}

export function entriesToJsonl(entries: MemoryExportEntry[]): string {
  if (entries.length === 0) return '';
  return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
}
