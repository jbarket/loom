/**
 * MCP tool handler for harness-manifest initialization.
 * Thin wrapper over src/blocks/harness.initHarness.
 */
import { initHarness, describeHarness, resolvePeerToHarness, normalizePeer } from '../blocks/harness.js';

export async function harnessInit(
  contextDir: string,
  input: { name: string; overwrite?: boolean },
): Promise<string> {
  const result = await initHarness(contextDir, input.name, {
    overwrite: input.overwrite,
  });
  return `Harness manifest ${result.name}: ${result.path} (${result.action})`;
}

/**
 * MCP tool handler for harness self-description.
 *
 * SCOPING GUARD: the target is derived from the CONNECTED PEER, never a
 * caller-supplied arbitrary name. A connected harness can only write the
 * manifest it resolves to (data-driven) or a new one named by its own
 * clientInfo.name — it cannot write another harness's file. With no connected
 * peer (no clientInfo), the call is refused.
 */
export async function harnessDescribe(
  contextDir: string,
  input: { content: string; version?: string },
  peerName?: string,
): Promise<string> {
  if (!peerName) {
    return (
      'Error: harness_describe could not identify the connected peer — no MCP ' +
      'clientInfo.name on this connection. A harness may only describe itself, ' +
      'so there is no target to write.'
    );
  }
  const target = (await resolvePeerToHarness(contextDir, peerName)) ?? normalizePeer(peerName);
  if (!target) {
    return (
      `Error: harness_describe could not derive a manifest key from peer ` +
      `${JSON.stringify(peerName)}.`
    );
  }
  const result = await describeHarness(contextDir, target, input.content, {
    version: input.version,
  });
  return `Harness manifest ${result.key}: ${result.path} (${result.action})`;
}
