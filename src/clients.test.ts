import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getBuiltInAdapter, loadClientAdapter } from './clients.js';

describe('getBuiltInAdapter', () => {
  it('returns adapter for claude-code', () => {
    const adapter = getBuiltInAdapter('claude-code');
    expect(adapter).toContain('Claude Code');
    expect(adapter).toContain('mcp__loom__');
  });

  it('returns adapter for hermes', () => {
    const adapter = getBuiltInAdapter('hermes');
    expect(adapter).toContain('Hermes');
    expect(adapter).toContain('mcp_loom_');
    expect(adapter).toContain('3,600 chars');
  });

  it('returns adapter for gemini-cli', () => {
    const adapter = getBuiltInAdapter('gemini-cli');
    expect(adapter).toContain('Gemini');
  });

  it('returns adapter for openclaw', () => {
    const adapter = getBuiltInAdapter('openclaw');
    expect(adapter).toContain('OpenClaw');
    expect(adapter).toContain('mcp_loom_');
  });

  it('returns adapter for nemoclaw', () => {
    const adapter = getBuiltInAdapter('nemoclaw');
    expect(adapter).toContain('NemoClaw');
    expect(adapter).toContain('mcp_loom_');
  });

  it('returns null for unknown client', () => {
    expect(getBuiltInAdapter('unknown-runtime')).toBeNull();
  });

  it('all adapters include the identity tool', () => {
    for (const client of ['claude-code', 'gemini-cli', 'hermes', 'openclaw', 'nemoclaw']) {
      expect(getBuiltInAdapter(client)).toContain('identity');
    }
  });
});

describe('loadClientAdapter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-clients-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns built-in adapter when no override exists', async () => {
    const adapter = await loadClientAdapter(tempDir, 'hermes');
    expect(adapter).toContain('Hermes');
  });

  it('returns user override when present', async () => {
    await mkdir(join(tempDir, 'clients'), { recursive: true });
    await writeFile(join(tempDir, 'clients', 'hermes.md'), '## Custom Hermes Adapter\nCustom content');

    const adapter = await loadClientAdapter(tempDir, 'hermes');
    expect(adapter).toContain('Custom Hermes Adapter');
    expect(adapter).not.toContain('Nous Research');
  });

  it('returns null for unknown client with no override', async () => {
    const adapter = await loadClientAdapter(tempDir, 'unknown-runtime');
    expect(adapter).toBeNull();
  });
});
