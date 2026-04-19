import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadIdentity } from './identity.js';

describe('loadIdentity', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-identity-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns graceful fallback when IDENTITY.md is missing', async () => {
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Identity');
    expect(result).toContain('No IDENTITY.md found');
  });

  it('loads IDENTITY.md when present', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'I am Art.');
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Identity');
    expect(result).toContain('I am Art.');
    expect(result).not.toContain('No IDENTITY.md found');
  });

  it('loads preferences.md when present', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await writeFile(join(tempDir, 'preferences.md'), 'Prefers dark mode');
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Preferences');
    expect(result).toContain('Prefers dark mode');
  });

  it('omits preferences section when file is missing', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir);
    expect(result).not.toContain('# Preferences');
  });

  it('loads self-model.md when present', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await writeFile(join(tempDir, 'self-model.md'), 'Good at TypeScript');
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Self-Model');
    expect(result).toContain('Good at TypeScript');
  });

  it('omits self-model section when file is missing', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir);
    expect(result).not.toContain('# Self-Model');
  });

  it('loads project-specific briefing when project is specified', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await mkdir(join(tempDir, 'projects'), { recursive: true });
    await writeFile(join(tempDir, 'projects', 'vigil.md'), 'Vigil is a daemon');
    const result = await loadIdentity(tempDir, 'vigil');
    expect(result).toContain('# Project: vigil');
    expect(result).toContain('Vigil is a daemon');
  });

  it('omits project section when project file is missing', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir, 'nonexistent');
    expect(result).not.toContain('# Project:');
  });

  it('omits project section when no project is specified', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir);
    expect(result).not.toContain('# Project:');
  });

  it('loads memory index when present', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await mkdir(join(tempDir, 'memories'), { recursive: true });
    await writeFile(join(tempDir, 'memories', 'INDEX.md'), '# Memory Index\n\n- entry one');
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Memories');
    expect(result).toContain('entry one');
  });

  it('joins sections with --- separator', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await writeFile(join(tempDir, 'preferences.md'), 'Prefs');
    const result = await loadIdentity(tempDir);
    expect(result).toContain('---');
  });

  it('works with a completely empty context directory', async () => {
    const result = await loadIdentity(tempDir);
    // Should still return something valid -- just the fallback identity
    expect(result).toContain('# Identity');
    expect(result).toBeTruthy();
  });

  it('appends client adapter when client is specified', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir, undefined, 'hermes');
    expect(result).toContain('Hermes');
    expect(result).toContain('mcp_loom_');
  });

  it('appends client adapter for claude-code', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir, undefined, 'claude-code');
    expect(result).toContain('Claude Code');
    expect(result).toContain('mcp__loom__');
  });

  it('omits runtime section when no client is specified', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir);
    expect(result).not.toContain('## Runtime:');
  });

  it('silently ignores unknown client names', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir, undefined, 'unknown-runtime');
    expect(result).toContain('# Identity');
    expect(result).not.toContain('## Runtime:');
  });
});
