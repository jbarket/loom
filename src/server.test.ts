/**
 * Tests for the MCP server factory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

describe('createLoomServer — stack version', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'server-version-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes LOOM_STACK_VERSION=1 on boot for a fresh context dir', () => {
    const contextDir = makeContextDir(tmpDir);
    const stampPath = join(contextDir, 'LOOM_STACK_VERSION');
    expect(existsSync(stampPath)).toBe(false);

    createLoomServer({ contextDir });

    expect(existsSync(stampPath)).toBe(true);
    expect(readFileSync(stampPath, 'utf-8')).toBe('1\n');
  });

  it('leaves an existing LOOM_STACK_VERSION=1 alone', () => {
    const contextDir = makeContextDir(tmpDir);
    writeFileSync(join(contextDir, 'LOOM_STACK_VERSION'), '1\n');

    createLoomServer({ contextDir });

    expect(readFileSync(join(contextDir, 'LOOM_STACK_VERSION'), 'utf-8')).toBe('1\n');
  });

  it('throws on boot when on-disk version is ahead of what loom understands', () => {
    const contextDir = makeContextDir(tmpDir);
    writeFileSync(join(contextDir, 'LOOM_STACK_VERSION'), '2\n');

    expect(() => createLoomServer({ contextDir })).toThrow(/is version 2/i);
  });

  it('throws on boot when LOOM_STACK_VERSION is unparseable', () => {
    const contextDir = makeContextDir(tmpDir);
    writeFileSync(join(contextDir, 'LOOM_STACK_VERSION'), 'banana');

    expect(() => createLoomServer({ contextDir })).toThrow(/unparseable/i);
  });
});
