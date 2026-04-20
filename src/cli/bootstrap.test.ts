import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';

describe('loom bootstrap', () => {
  let tempDir: string;

  beforeEach(async () => { tempDir = await mkdtemp(join(tmpdir(), 'loom-cli-boot-')); });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  it('runs flag-driven when all required flags are provided', async () => {
    const { stdout, code } = await runCliCaptured([
      'bootstrap',
      '--name', 'Sage',
      '--purpose', 'Help me code',
      '--voice', 'Direct, terse',
      '--context-dir', tempDir,
    ]);
    expect(code).toBe(0);
    await access(join(tempDir, 'IDENTITY.md'));
    await access(join(tempDir, 'preferences.md'));
    await access(join(tempDir, 'self-model.md'));
    expect(stdout.length).toBeGreaterThan(0);
  });

  it('reads params from piped JSON on stdin', async () => {
    const payload = JSON.stringify({
      name: 'Oak', purpose: 'p', voice: 'v', clients: ['claude-code'],
    });
    const { code } = await runCliCaptured(
      ['bootstrap', '--context-dir', tempDir],
      { stdin: payload },
    );
    expect(code).toBe(0);
    await access(join(tempDir, 'IDENTITY.md'));
  });

  it('returns exit 2 when required flags are missing and stdin is empty (TTY simulated)', async () => {
    const { code } = await runCliCaptured(
      ['bootstrap', '--context-dir', tempDir],
    );
    expect(code).not.toBe(0);
  });

  it('emits structured result on --json', async () => {
    const { stdout, code } = await runCliCaptured([
      'bootstrap',
      '--name', 'Wren', '--purpose', 'p', '--voice', 'v',
      '--context-dir', tempDir, '--json',
    ]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('contextDir');
    expect(parsed).toHaveProperty('wrote');
    expect(parsed.wrote).toEqual(expect.arrayContaining([
      expect.stringMatching(/IDENTITY\.md$/),
    ]));
  });
});
