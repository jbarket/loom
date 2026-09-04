#!/usr/bin/env node
/**
 * Loom — CLI + stdio MCP entry point.
 *
 * When argv[2] is a known CLI subcommand or --help/--version, routes to
 * src/cli/index.ts. Otherwise (or if argv is empty / only flags), falls
 * through to the MCP stdio server so existing .mcp.json configs keep
 * working.
 *
 * Configure via environment variables:
 *   LOOM_CONTEXT_DIR         — path to identity/memory directory (required)
 *   LOOM_SQLITE_DB_PATH      — override memories.db location (optional)
 *   LOOM_FASTEMBED_MODEL     — embedding model (default fast-bge-small-en-v1.5)
 *   LOOM_FASTEMBED_CACHE_DIR — ONNX cache (default ~/.cache/loom/fastembed)
 *   LOOM_CLIENT              — runtime client adapter name (optional)
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLoomServer } from './server.js';
import { resolveContextDir } from './config.js';
import { SUBCOMMANDS } from './cli/subcommands.js';

const CLI_KEYWORDS: ReadonlySet<string> = new Set(SUBCOMMANDS);

function isCliInvocation(argv: string[]): boolean {
  const first = argv[2];
  if (first === undefined) return false;
  if (first === '--help' || first === '-h') return true;
  if (first === '--version' || first === '-V') return true;
  return CLI_KEYWORDS.has(first);
}

export { isCliInvocation };

async function main() {
  if (isCliInvocation(process.argv)) {
    const { runCli } = await import('./cli/index.js');
    process.exit(await runCli(process.argv.slice(2)));
  }
  const contextDir = resolveContextDir();
  const { server } = createLoomServer({ contextDir });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * True when this module is the process entry point.
 *
 * `process.argv[1]` is whatever path the shell invoked, which for every
 * packaged install (`npm i -g`, `npm link`, `npx`) is a SYMLINK in a bin
 * directory, while `import.meta.url` always resolves to the real file. A
 * raw string compare is false in exactly those cases, so `main()` never
 * runs: no CLI dispatch, no MCP server, exit 0 with no output. Resolve
 * both sides before comparing.
 */
function isEntryPoint(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  const self = fileURLToPath(import.meta.url);
  if (argv1 === self) return true;
  try {
    return realpathSync(argv1) === realpathSync(self);
  } catch {
    return false;
  }
}

export { isEntryPoint };

if (isEntryPoint()) {
  main().catch((err) => {
    console.error('Loom failed to start:', err);
    process.exit(1);
  });
}
