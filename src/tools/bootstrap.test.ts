import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrap } from './bootstrap.js';

describe('bootstrap', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-bootstrap-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const BASE = {
    name: 'Test Agent',
    purpose: 'Run tests reliably',
    voice: 'Direct and concise',
  };

  it('creates IDENTITY.md, preferences.md, and self-model.md', async () => {
    await bootstrap(tempDir, BASE);

    const identity = await readFile(join(tempDir, 'IDENTITY.md'), 'utf-8');
    const prefs = await readFile(join(tempDir, 'preferences.md'), 'utf-8');
    const selfModel = await readFile(join(tempDir, 'self-model.md'), 'utf-8');

    expect(identity).toContain('# Test Agent');
    expect(identity).toContain('Run tests reliably');
    expect(identity).toContain('Direct and concise');

    expect(prefs).toContain('Test Agent');
    expect(prefs).toContain('No initial preferences set');

    expect(selfModel).toContain('# Self-Model');
    expect(selfModel).toContain('Strengths');
  });

  it('includes seed preferences in preferences.md when provided', async () => {
    await bootstrap(tempDir, { ...BASE, preferences: 'Prefers short answers' });
    const prefs = await readFile(join(tempDir, 'preferences.md'), 'utf-8');
    expect(prefs).toContain('Prefers short answers');
    expect(prefs).not.toContain('No initial preferences set');
  });

  it('returns a success message with file list', async () => {
    const result = await bootstrap(tempDir, BASE);
    expect(result).toContain('Test Agent');
    expect(result).toContain('IDENTITY.md');
    expect(result).toContain('preferences.md');
    expect(result).toContain('self-model.md');
  });

  it('refuses to overwrite existing files without force', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Existing identity');
    const result = await bootstrap(tempDir, BASE);
    expect(result).toContain('already exists');
    expect(result).toContain('IDENTITY.md');
    // Should not have overwritten
    const content = await readFile(join(tempDir, 'IDENTITY.md'), 'utf-8');
    expect(content).toBe('Existing identity');
  });

  it('overwrites existing files when force is true', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Old identity');
    await bootstrap(tempDir, { ...BASE, force: true });
    const content = await readFile(join(tempDir, 'IDENTITY.md'), 'utf-8');
    expect(content).toContain('# Test Agent');
    expect(content).not.toContain('Old identity');
  });

  it('includes hermes setup snippet when requested', async () => {
    const result = await bootstrap(tempDir, { ...BASE, clients: ['hermes'] });
    expect(result).toContain('Hermes');
    expect(result).toContain('mcp_loom_identity');
    expect(result).toContain('SOUL.md');
    expect(result).toContain('config.yaml');
  });

  it('includes claude-code setup snippet when requested', async () => {
    const result = await bootstrap(tempDir, { ...BASE, clients: ['claude-code'] });
    expect(result).toContain('Claude Code');
    expect(result).toContain('CLAUDE.md');
    expect(result).toContain('.mcp.json');
  });

  it('includes setup snippets for multiple clients', async () => {
    const result = await bootstrap(tempDir, { ...BASE, clients: ['hermes', 'claude-code'] });
    expect(result).toContain('Hermes');
    expect(result).toContain('Claude Code');
  });

  it('hints about available clients when none requested', async () => {
    const result = await bootstrap(tempDir, BASE);
    expect(result).toContain('hermes');
    expect(result).toContain('claude-code');
  });
});
