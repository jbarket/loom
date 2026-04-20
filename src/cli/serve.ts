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
  return 0;
}
