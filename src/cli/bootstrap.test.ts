import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';
import { CURRENT_STACK_VERSION, STACK_VERSION_FILE } from '../config.js';

describe('loom bootstrap', () => {
  let tempDir: string;

  beforeEach(async () => { tempDir = await mkdtemp(join(tmpdir(), 'loom-cli-boot-')); });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  it('runs flag-driven when all required flags are provided', async () => {
    const { stdout, code } = await runCliCaptured([
      'bootstrap',
      '--name', 'sage',
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
      name: 'oak', purpose: 'p', voice: 'v', clients: ['claude-code'],
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
      '--name', 'wren', '--purpose', 'p', '--voice', 'v',
      '--context-dir', tempDir, '--json',
    ]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('contextDir');
    expect(parsed).toHaveProperty('wrote');
    expect(parsed.wrote).toEqual(expect.arrayContaining([
      expect.stringMatching(/IDENTITY\.md$/),
    ]));
    expect(parsed.wrote.some((p: string) => p.endsWith('pursuits.md'))).toBe(false);
  });

  it('exits 1 when the stack version stamp is ahead of this build', async () => {
    await writeFile(join(tempDir, STACK_VERSION_FILE), `${CURRENT_STACK_VERSION + 1}\n`);
    const { stderr, code } = await runCliCaptured([
      'bootstrap',
      '--name', 'rook', '--purpose', 'p', '--voice', 'v',
      '--context-dir', tempDir,
    ]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/Upgrade loom/);
  });

  it('rejects a reserved name with a clear error', async () => {
    const { stderr, code } = await runCliCaptured([
      'bootstrap',
      '--name', 'current',
      '--purpose', 'p',
      '--voice', 'v',
      '--context-dir', tempDir,
    ]);
    expect(code).toBe(2);
    expect(stderr).toMatch(/reserved/);
  });

  it('rejects an uppercase name', async () => {
    const { stderr, code } = await runCliCaptured([
      'bootstrap',
      '--name', 'Art',
      '--purpose', 'p',
      '--voice', 'v',
      '--context-dir', tempDir,
    ]);
    expect(code).toBe(2);
    expect(stderr).toMatch(/lowercase/);
  });
});
