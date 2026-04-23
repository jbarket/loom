/**
 * Harness install + MCP round-trip integration tests.
 *
 * Validates three layers:
 *   1. `loom install --harness <x>` writes the skill file to the right path
 *   2. loom can be spawned as a real MCP stdio server and the identity tool
 *      returns a well-formed payload (the "transport/config layer" check —
 *      LLM side is not involved)
 *   3. `loom wake` CLI prints structured identity markdown to stdout
 *
 * Harness CI coverage:
 *   - claude-code:  npm install -g @anthropic-ai/claude-code  (tested)
 *   - codex:        npm install -g @openai/codex              (tested)
 *   - gemini-cli:   npm install -g @google/gemini-cli         (tested)
 *   - opencode:     `opencode-ai` npm package not consistently available in CI — skipped;
 *                   skill path is ~/.agents/skills/ (identical to codex/gemini-cli)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { runCliCaptured } from './cli/test-helpers.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Timeout for tests that spawn a subprocess (tsx startup adds latency).
const SUBPROCESS_TIMEOUT = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeCtx(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'loom-hr-ctx-'));
  await writeFile(join(dir, 'LOOM_STACK_VERSION'), '1\n');
  await writeFile(
    join(dir, 'IDENTITY.md'),
    '# Integration Test Agent\n\nTest identity for harness round-trip tests.\n',
  );
  return dir;
}

/**
 * Spawn loom as an MCP stdio server against a throwaway context dir.
 * Uses `npx tsx src/index.ts` so it works in both dev (tsx in devDependencies)
 * and CI (built artifacts aren't guaranteed to match the current source tree
 * when the test file itself is loaded via tsx).
 */
async function connectMcp(contextDir: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', join(REPO_ROOT, 'src', 'index.ts')],
    env: {
      ...process.env,
      LOOM_CONTEXT_DIR: contextDir,
      LOOM_MEMORY_BACKEND: 'filesystem',
    },
  });
  const client = new Client({ name: 'harness-roundtrip-test', version: '0.0.1' });
  await client.connect(transport);
  return client;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('harness install + MCP round-trip', () => {
  let ctx: string;
  let tmpHome: string;

  beforeEach(async () => {
    ctx = await makeCtx();
    tmpHome = await mkdtemp(join(tmpdir(), 'loom-hr-home-'));
  });

  afterEach(async () => {
    await Promise.all([
      rm(ctx, { recursive: true, force: true }),
      rm(tmpHome, { recursive: true, force: true }),
    ]);
  });

  // ── 1. Skill install ───────────────────────────────────────────────────────

  describe('loom install', () => {
    const HARNESSES = ['claude-code', 'codex', 'gemini-cli'] as const;

    for (const harness of HARNESSES) {
      it(`${harness}: writes skill file to specified path`, async () => {
        const dest = join(tmpHome, 'skills', harness, 'loom-setup.md');
        const result = await runCliCaptured(
          ['install', '--harness', harness, '--to', dest],
          { contextDir: ctx },
        );
        expect(result.code, result.stderr).toBe(0);
        const content = await readFile(dest, 'utf-8');
        // Skill file must contain the frontmatter name and substantive content.
        expect(content).toContain('name: loom-setup');
        expect(content.length).toBeGreaterThan(500);
      });
    }

    it('is idempotent: second install returns skipped-exists', async () => {
      const dest = join(tmpHome, 'skills', 'loom-setup.md');
      await runCliCaptured(
        ['install', '--harness', 'claude-code', '--to', dest],
        { contextDir: ctx },
      );
      const second = await runCliCaptured(
        ['install', '--harness', 'claude-code', '--to', dest, '--json'],
        { contextDir: ctx },
      );
      expect(second.code).toBe(0);
      const parsed = JSON.parse(second.stdout.trim());
      expect(parsed.action).toBe('skipped-exists');
    });

    it('--force overwrites a stale file', async () => {
      const dest = join(tmpHome, 'skills', 'loom-setup.md');
      // Write stale content first.
      await runCliCaptured(
        ['install', '--harness', 'claude-code', '--to', dest],
        { contextDir: ctx },
      );
      await writeFile(dest, '# stale content\n');

      // Without --force: skipped-stale.
      const withoutForce = await runCliCaptured(
        ['install', '--harness', 'claude-code', '--to', dest, '--json'],
        { contextDir: ctx },
      );
      expect(JSON.parse(withoutForce.stdout.trim()).action).toBe('skipped-stale');

      // With --force: overwritten.
      const withForce = await runCliCaptured(
        ['install', '--harness', 'claude-code', '--to', dest, '--force', '--json'],
        { contextDir: ctx },
      );
      expect(JSON.parse(withForce.stdout.trim()).action).toBe('overwritten');
      // Content is restored to the canonical skill.
      const restored = await readFile(dest, 'utf-8');
      expect(restored).toContain('name: loom-setup');
    });
  });

  // ── 2. MCP transport layer ─────────────────────────────────────────────────
  //
  // Spawns loom as an MCP stdio server (the same way Claude Code / Codex would)
  // and drives it via the MCP SDK client. No LLM, no API keys — only the
  // transport/config layer is exercised.

  describe('MCP server', () => {
    let client: Client | undefined;

    afterEach(async () => {
      await client?.close().catch(() => {});
      client = undefined;
    });

    it(
      'spawns loom as MCP stdio server and exposes expected tools',
      async () => {
        client = await connectMcp(ctx);
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);
        expect(names).toContain('identity');
        expect(names).toContain('remember');
        expect(names).toContain('recall');
        expect(names).toContain('forget');
        expect(names).toContain('harness_init');
      },
      SUBPROCESS_TIMEOUT,
    );

    it(
      'identity tool returns text payload beginning with # Identity',
      async () => {
        client = await connectMcp(ctx);
        const result = await client.callTool({ name: 'identity', arguments: {} });
        expect(result.isError).toBeFalsy();
        expect(result.content).toHaveLength(1);
        const block = result.content[0] as { type: string; text: string };
        expect(block.type).toBe('text');
        expect(block.text).toMatch(/^# Identity/);
        expect(block.text).toContain('Integration Test Agent');
      },
      SUBPROCESS_TIMEOUT,
    );

    it(
      'identity tool includes harness section for claude-code client',
      async () => {
        client = await connectMcp(ctx);
        const result = await client.callTool({
          name: 'identity',
          arguments: { client: 'claude-code' },
        });
        expect(result.isError).toBeFalsy();
        const block = result.content[0] as { type: string; text: string };
        expect(block.text).toContain('# Harness: claude-code');
      },
      SUBPROCESS_TIMEOUT,
    );

    it(
      'identity tool includes harness section for codex client',
      async () => {
        client = await connectMcp(ctx);
        const result = await client.callTool({
          name: 'identity',
          arguments: { client: 'codex' },
        });
        expect(result.isError).toBeFalsy();
        const block = result.content[0] as { type: string; text: string };
        expect(block.text).toContain('# Harness: codex');
      },
      SUBPROCESS_TIMEOUT,
    );

    it(
      'identity tool includes harness section for gemini-cli client',
      async () => {
        client = await connectMcp(ctx);
        const result = await client.callTool({
          name: 'identity',
          arguments: { client: 'gemini-cli' },
        });
        expect(result.isError).toBeFalsy();
        const block = result.content[0] as { type: string; text: string };
        expect(block.text).toContain('# Harness: gemini-cli');
      },
      SUBPROCESS_TIMEOUT,
    );
  });

  // ── 3. Wake CLI ────────────────────────────────────────────────────────────

  describe('loom wake', () => {
    it('prints identity markdown to stdout', async () => {
      const result = await runCliCaptured(['wake'], { contextDir: ctx });
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/^# Identity/);
      expect(result.stdout).toContain('Integration Test Agent');
    });

    it('includes harness section when --client flag is given', async () => {
      const result = await runCliCaptured(
        ['wake', '--client', 'claude-code'],
        { contextDir: ctx },
      );
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('# Harness: claude-code');
    });

    it('includes codex harness section', async () => {
      const result = await runCliCaptured(
        ['wake', '--client', 'codex'],
        { contextDir: ctx },
      );
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('# Harness: codex');
    });
  });
});
