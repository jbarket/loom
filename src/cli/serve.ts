/**
 * loom serve — MCP startup. Default is stdio; `--http` starts the mesh-reachable
 * HTTP daemon (c-loom-transport) bound to a loopback/mesh interface with an
 * optional bearer token. Host/port/token come from flags or env:
 *   --http  --host <h>  --port <n>   (LOOM_HTTP_HOST, LOOM_HTTP_PORT, LOOM_BEARER_TOKEN)
 * Bind-safety refuses a public/0.0.0.0 host; Tailscale is the access control.
 */
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLoomServer } from '../server.js';
import { startHttpServer } from '../transport/http-server.js';
import { resolveContextDir } from '../config.js';
import type { IOStreams } from './io.js';

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      http: { type: 'boolean', default: false },
      host: { type: 'string' },
      port: { type: 'string' },
    },
    allowPositionals: true,
  });

  const contextDir = resolveContextDir();

  if (values.http) {
    const host = values.host ?? process.env.LOOM_HTTP_HOST ?? '127.0.0.1';
    const port = Number(values.port ?? process.env.LOOM_HTTP_PORT ?? 8787);
    const token = process.env.LOOM_BEARER_TOKEN || undefined;
    const handle = await startHttpServer({ contextDir, host, port, token });
    io.stderr(
      `loom: HTTP MCP daemon on http://${handle.host}:${handle.port} ` +
        `(${token ? 'bearer-gated' : 'open — network is the boundary'})\n`,
    );
    // Hold open until the process is signalled.
    await new Promise<void>(() => {});
    return 0;
  }

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
