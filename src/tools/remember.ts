/**
 * Remember tool — stores an episodic memory that persists across sessions.
 *
 * Delegates to the configured MemoryBackend. v0.3.1 ships a single
 * backend (sqlite-vec + fastembed); the interface stays generic so
 * future stacks can swap in without changing the tool contract.
 */
import { createBackend } from '../backends/index.js';
import type { MemoryInput, MemoryRef } from '../backends/types.js';



export async function remember(
  contextDir: string,
  input: MemoryInput,
): Promise<MemoryRef> {
  const backend = createBackend(contextDir);
  return backend.remember(input);
}
