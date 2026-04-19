/**
 * Tests for the MCP server factory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLoomServer, type LoomServerConfig } from './server.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContextDir(base: string): string {
  const contextDir = join(base, 'context');
  mkdirSync(join(contextDir, 'memories'), { recursive: true });

  return contextDir;
}

function makeConfig(base: string): LoomServerConfig {
  return { contextDir: makeContextDir(base) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createLoomServer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'server-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a server without errors', () => {
    const config = makeConfig(tmpDir);
    const { server } = createLoomServer(config);
    expect(server).toBeDefined();
  });

  it('creates multiple independent server instances', () => {
    const config = makeConfig(tmpDir);
    const { server: s1 } = createLoomServer(config);
    const { server: s2 } = createLoomServer(config);
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s1).not.toBe(s2);
  });
});
