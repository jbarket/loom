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
 *   LOOM_SKIP_STALE_CHECK    — skip stale dist/ rebuild guard (set "1" or "true")
 */
import { spawnSync, spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLoomServer } from './server.js';
import { resolveContextDir, resolveRepoRoot } from './config.js';
import { SUBCOMMANDS } from './cli/subcommands.js';

const CLI_KEYWORDS: ReadonlySet<string> = new Set(SUBCOMMANDS);

/**
 * Find the newest file (by mtime) under `dir` matching `ext`.
 * Returns null if no file found. Skips `node_modules`.
 */
export function newestFile(dir: string, ext: string): string | null {
  let best: string | null = null;
  let bestMtime = 0;
  let entries: { path: string; isDir: boolean }[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) => ({
      path: join(dir, e.name),
      isDir: e.isDirectory(),
    }));
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.isDir) {
      if (e.path.endsWith('/node_modules')) continue;
      const child = newestFile(e.path, ext);
      if (child) {
        const childMtime = statSync(child).mtimeMs;
        if (childMtime > bestMtime) {
          bestMtime = childMtime;
          best = child;
        }
      }
    } else if (e.path.endsWith(ext)) {
      try {
        const mt = statSync(e.path).mtimeMs;
        if (mt > bestMtime) {
          bestMtime = mt;
          best = e.path;
        }
      } catch {
        /* skip */
      }
    }
  }
  return best;
}

/**
 * Stale-dist guard (SLE-158).
 *
 * Rebuilds dist/ when src/ has newer .ts files than dist/ has .js/.d.ts files.
 * After rebuilding, re-execs into dist/ so fresh modules are loaded.
 *
 * Skipped when LOOM_SKIP_STALE_CHECK is set.
 */
export async function ensureFreshDist(repoRoot: string): Promise<void> {
  if (process.env.LOOM_SKIP_STALE_CHECK) return;

  const distDir = join(repoRoot, 'dist');
  const srcDir = join(repoRoot, 'src');

  const newestSrc = newestFile(srcDir, '.ts');
  if (!newestSrc) return;

  const newestDistJs = newestFile(distDir, '.js');
  const newestDistDts = newestFile(distDir, '.d.ts');
  const newestDist = newestDistJs ?? newestDistDts;

  // dist/ exists and is at least as fresh as src/
  if (newestDist && statSync(newestDist).mtimeMs >= statSync(newestSrc).mtimeMs) return;

  // dist/ is stale — rebuild
  const tsc = spawnSync('npx', ['tsc'], { cwd: repoRoot, stdio: 'inherit' });
  if (tsc.status !== 0) {
    process.stderr.write(
      `Stale-dist rebuild failed (exit ${tsc.status}). Run \`npm run build\` manually.\n`,
    );
    process.exit(1);
  }

  // Re-exec into the freshly built dist/ so modules are loaded from disk, not
  // cached from the old build.
  const nodeBin = process.execPath;
  const args = [join(distDir, 'index.js'), ...process.argv.slice(2)];
  const child = spawn(nodeBin, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  // Never resolve — parent blocks here until the child exits via process.exit().
  // This prevents main() from being called in the parent while the child runs.
  await new Promise<never>(() => {
    child.on('close', (code) => process.exit(code ?? 0));
  });
}

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolveRepoRoot();
  ensureFreshDist(repoRoot)
    .then(() => main())
    .catch((err) => {
      console.error('Loom failed to start:', err);
      process.exit(1);
    });
}
