/**
 * MCP tool handler for harness-manifest initialization.
 * Thin wrapper over src/blocks/harness.initHarness.
 */
import { initHarness } from '../blocks/harness.js';

export async function harnessInit(
  contextDir: string,
  input: { name: string; overwrite?: boolean },
): Promise<string> {
  const result = await initHarness(contextDir, input.name, {
    overwrite: input.overwrite,
  });
  return `Harness manifest ${result.name}: ${result.path} (${result.action})`;
}
