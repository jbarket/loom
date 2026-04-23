/**
 * Integration test harness — SLE-29.
 *
 * Verifies the MCP stdio transport layer and harness install config generation.
 * Does NOT require a live LLM; mocks the model side by connecting directly
 * to loom serve via the MCP SDK client.
 *
 * What this tests:
 *   1. loom bootstrap — initializes a fresh agent
 *   2. loom wake — produces a valid identity payload
 *   3. loom install --harness <x> — generates harness config files
 *   4. loom serve (MCP stdio) — initializes, lists tools, responds to identity call
 *   5. loom snapshot — commits context dir to git
 *
 * Skipped in CI if harness CLIs (claude, codex) are not installed.
 * The MCP transport test is always run.
 *
 * Run:
 *   npm run build && npx tsx scripts/integration-harness.ts
 */
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execFile = promisify(nodeExecFile);

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const DIST_INDEX = resolve(import.meta.dirname, '..', 'dist', 'index.js');

async function loom(contextDir: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFile('node', [DIST_INDEX, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, LOOM_CONTEXT_DIR: contextDir },
  });
}

// ─── Test suites ──────────────────────────────────────────────────────────────

async function testBootstrapAndWake(contextDir: string) {
  console.log('\n[1] Bootstrap + wake');

  await test('bootstrap via piped JSON', async () => {
    const { stdout } = await execFile(
      'node', [DIST_INDEX, 'bootstrap', '--json',
        '--name', 'Integration Agent',
        '--purpose', 'CI integration testing',
        '--voice', 'Direct'],
      {
        encoding: 'utf-8',
        env: { ...process.env, LOOM_CONTEXT_DIR: contextDir },
      },
    );
    const result = JSON.parse(stdout);
    assert(result.contextDir === contextDir, `contextDir mismatch: ${result.contextDir}`);
    assert(Array.isArray(result.wrote), 'expected wrote array');
  });

  await test('wake produces identity output', async () => {
    const { stdout } = await loom(contextDir, ['wake']);
    assert(stdout.includes('Integration Agent'), 'identity should include agent name');
  });

  await test('doctor --json returns valid shape', async () => {
    const { stdout } = await loom(contextDir, ['doctor', '--json']);
    const result = JSON.parse(stdout);
    assert(typeof result.nodeOk === 'boolean', 'expected nodeOk field');
    assert(typeof result.nodeVersion === 'string', 'expected nodeVersion field');
    assert(Array.isArray(result.existingAgents), 'expected existingAgents array');
  });
}

async function testHarnessInstall(contextDir: string, tmpRoot: string) {
  console.log('\n[2] Harness install config generation');

  const targets = ['claude-code', 'codex', 'gemini-cli', 'other'] as const;
  for (const harness of targets) {
    const destFile = join(tmpRoot, `loom-${harness}.md`);
    await test(`install --harness ${harness} writes config file`, async () => {
      const { stdout } = await execFile(
        'node', [DIST_INDEX, 'install', '--harness', harness, '--to', destFile, '--json'],
        {
          encoding: 'utf-8',
          env: { ...process.env, LOOM_CONTEXT_DIR: contextDir },
        },
      );
      const result = JSON.parse(stdout);
      assert(result.target === harness, `target mismatch: ${result.target}`);
      assert(typeof result.path === 'string', 'expected path field');
      assert(await fileExists(destFile), `config file not created at ${destFile}`);
    });

    await test(`install --harness ${harness} config contains loom reference`, async () => {
      const content = await readFile(join(tmpRoot, `loom-${harness}.md`), 'utf-8');
      assert(content.includes('loom'), 'config should reference loom');
    });
  }
}

async function testMcpTransport(contextDir: string) {
  console.log('\n[3] MCP stdio transport');

  await test('MCP client connects and lists tools', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [DIST_INDEX, 'serve'],
      env: { ...process.env, LOOM_CONTEXT_DIR: contextDir },
    });
    const client = new Client({ name: 'integration-harness', version: '1.0.0' });
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      const required = ['identity', 'remember', 'recall', 'forget', 'update', 'memory_list'];
      for (const name of required) {
        assert(names.includes(name), `missing tool: ${name}`);
      }
    } finally {
      await client.close();
    }
  });

  await test('identity tool returns non-empty payload', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [DIST_INDEX, 'serve'],
      env: { ...process.env, LOOM_CONTEXT_DIR: contextDir },
    });
    const client = new Client({ name: 'integration-harness', version: '1.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({ name: 'identity', arguments: {} });
      assert(!result.isError, `identity tool returned error: ${JSON.stringify(result)}`);
      assert(Array.isArray(result.content), 'expected content array');
      const text = (result.content as Array<{ type: string; text: string }>)
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
      assert(text.length > 0, 'identity payload should not be empty');
      assert(text.includes('Integration Agent'), 'identity payload should include agent name');
    } finally {
      await client.close();
    }
  });

  await test('remember + recall round-trip', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [DIST_INDEX, 'serve'],
      env: { ...process.env, LOOM_CONTEXT_DIR: contextDir },
    });
    const client = new Client({ name: 'integration-harness', version: '1.0.0' });
    await client.connect(transport);

    try {
      const stamp = Date.now().toString();
      const remResult = await client.callTool({
        name: 'remember',
        arguments: {
          category: 'self',
          title: `integration-test-${stamp}`,
          content: `Integration harness ran at ${stamp}`,
          ttl: '1h',
        },
      });
      assert(!remResult.isError, `remember failed: ${JSON.stringify(remResult)}`);

      const recResult = await client.callTool({
        name: 'recall',
        arguments: { query: `integration harness ${stamp}`, limit: 5 },
      });
      assert(!recResult.isError, `recall failed: ${JSON.stringify(recResult)}`);
      const text = (recResult.content as Array<{ type: string; text: string }>)
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
      assert(text.includes(stamp), 'recalled text should contain the stamp');
    } finally {
      await client.close();
    }
  });
}

async function testSnapshot(contextDir: string) {
  console.log('\n[4] Snapshot');

  await test('snapshot commits context dir', async () => {
    const { stdout } = await loom(contextDir, ['snapshot', '--json']);
    const result = JSON.parse(stdout);
    assert(typeof result.commit === 'string', 'expected commit hash');
    assert(Array.isArray(result.changedFiles), 'expected changedFiles array');
    assert(result.changedFiles.length > 0, 'expected at least one committed file');
  });

  await test('second snapshot reports nothing-to-commit', async () => {
    const { stdout } = await loom(contextDir, ['snapshot', '--json']);
    const result = JSON.parse(stdout);
    assert(result.commit === null, 'expected null commit on clean repo');
    assert(result.changedFiles.length === 0, 'expected empty changedFiles');
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Verify build exists
  if (!(await fileExists(DIST_INDEX))) {
    console.error(`Error: ${DIST_INDEX} not found. Run 'npm run build' first.`);
    process.exit(1);
  }

  const tmpRoot = await mkdtemp(join(tmpdir(), 'loom-integration-'));
  const contextDir = join(tmpRoot, 'agent');

  console.log(`Integration harness — context dir: ${contextDir}`);

  try {
    await testBootstrapAndWake(contextDir);
    await testHarnessInstall(contextDir, tmpRoot);
    await testMcpTransport(contextDir);
    await testSnapshot(contextDir);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
  console.log('All integration tests passed.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
