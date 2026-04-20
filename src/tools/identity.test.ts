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

describe('loadIdentity — model manifest', () => {
  let tempDir: string;
  const originalModelEnv = process.env.LOOM_MODEL;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-model-wake-'));
    delete process.env.LOOM_MODEL;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (originalModelEnv === undefined) {
      delete process.env.LOOM_MODEL;
    } else {
      process.env.LOOM_MODEL = originalModelEnv;
    }
  });

  it('omits the "# Model:" section when neither env nor param is set', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir);
    expect(result).not.toContain('# Model:');
  });

  it('emits a nudge when LOOM_MODEL is set but no manifest exists', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    process.env.LOOM_MODEL = 'claude-opus';
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Model: claude-opus (manifest missing)');
    expect(result).toContain('model: claude-opus');
    expect(result).toContain('## Capability notes');
  });

  it('emits manifest body when the file is present', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await mkdir(join(tempDir, 'models'), { recursive: true });
    await writeFile(
      join(tempDir, 'models', 'claude-opus.md'),
      '---\nmodel: claude-opus\n---\n\n## Capability notes\nStrong tool use.\n',
    );
    process.env.LOOM_MODEL = 'claude-opus';
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Model: claude-opus');
    expect(result).not.toContain('manifest missing');
    expect(result).toContain('Strong tool use');
  });

  it('accepts a model param that overrides LOOM_MODEL', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    process.env.LOOM_MODEL = 'claude-opus';
    const result = await loadIdentity(tempDir, undefined, undefined, 'claude-haiku');
    expect(result).toContain('# Model: claude-haiku (manifest missing)');
    expect(result).not.toContain('# Model: claude-opus');
  });
});

describe('loadIdentity — harness manifest', () => {
  let tempDir: string;
  let savedLoomClient: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-harness-wake-'));
    savedLoomClient = process.env.LOOM_CLIENT;
    delete process.env.LOOM_CLIENT;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (savedLoomClient !== undefined) {
      process.env.LOOM_CLIENT = savedLoomClient;
    } else {
      delete process.env.LOOM_CLIENT;
    }
  });

  it('omits the "# Harness:" section when no client is specified', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir);
    expect(result).not.toContain('# Harness:');
  });

  it('emits a nudge section when client is set but no manifest exists', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir, undefined, 'claude-code');
    expect(result).toContain('# Harness: claude-code (manifest missing)');
    expect(result).toContain('harness: claude-code');
    expect(result).toContain('## Tool prefixes');
  });

  it('emits the harness manifest body when present', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await mkdir(join(tempDir, 'harnesses'), { recursive: true });
    await writeFile(
      join(tempDir, 'harnesses', 'claude-code.md'),
      '---\nharness: claude-code\nversion: 0.4\n---\n\n## Tool prefixes\nmcp__loom__*\n',
    );
    const result = await loadIdentity(tempDir, undefined, 'claude-code');
    expect(result).toContain('# Harness: claude-code');
    expect(result).not.toContain('manifest missing');
    expect(result).toContain('mcp__loom__*');
  });
});

describe('loadIdentity — procedures', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-proc-wake-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('omits the "# Procedures" section when procedures/ is missing', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    const result = await loadIdentity(tempDir);
    expect(result).not.toContain('# Procedures');
  });

  it('emits procedures joined with --- when present', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await mkdir(join(tempDir, 'procedures'), { recursive: true });
    await writeFile(join(tempDir, 'procedures', 'verify.md'), '# Verify\n\nAlways verify.');
    await writeFile(join(tempDir, 'procedures', 'reflect.md'), '# Reflect\n\nAlways reflect.');
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Procedures');
    expect(result).toContain('Always verify');
    expect(result).toContain('Always reflect');
  });

  it('prepends a cap warning when >10 procedures are present', async () => {
    await writeFile(join(tempDir, 'IDENTITY.md'), 'Creed');
    await mkdir(join(tempDir, 'procedures'), { recursive: true });
    for (let i = 0; i < 11; i++) {
      await writeFile(
        join(tempDir, 'procedures', `proc-${i.toString().padStart(2, '0')}.md`),
        `# ${i}\nbody`,
      );
    }
    const result = await loadIdentity(tempDir);
    expect(result).toContain('# Procedures');
    expect(result.toLowerCase()).toContain('cap exceeded');
  });
});
