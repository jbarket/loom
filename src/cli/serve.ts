/**
 * loom serve — explicit alias for stdio MCP startup.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLoomServer } from '../server.js';
import { resolveContextDir } from '../config.js';
import type { IOStreams } from './io.js';

export async function run(_argv: string[], _io: IOStreams): Promise<number> {
  const contextDir = resolveContextDir();
  const { server } = createLoomServer({ contextDir });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // connect() resolves when the stdio transport STARTS, not when it closes.
  // Returning here would let the CLI dispatcher process.exit(0) and kill the
  // server the instant it came up. Hold until the client hangs up.
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
  return 0;
}
