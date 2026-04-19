/**
 * Loom — stdio MCP entry point
 *
 * Runs loom as a stdio MCP server. Drop into any MCP-compatible runtime
 * by pointing it at this file:
 *
 *   {"command": "node", "args": ["/path/to/loom/dist/index.js"]}
 *
 * Configure via environment variables:
 *   LOOM_CONTEXT_DIR         — path to identity/memory directory (required)
 *   LOOM_SQLITE_DB_PATH      — override memories.db location (optional)
 *   LOOM_FASTEMBED_MODEL     — embedding model (default fast-bge-small-en-v1.5)
 *   LOOM_FASTEMBED_CACHE_DIR — ONNX cache (default ~/.cache/loom/fastembed)
 *   LOOM_CLIENT              — runtime client adapter name (optional)
 */
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLoomServer } from './server.js';
import { resolveContextDir } from './config.js';

async function main() {
  const contextDir = resolveContextDir();
  const { server } = createLoomServer({ contextDir });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Loom failed to start:', err);
    process.exit(1);
  });
}
