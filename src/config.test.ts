import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

import { resolveContextDir } from './config.js';

describe('resolveContextDir', () => {
  const originalEnv = process.env.LOOM_CONTEXT_DIR;
  const originalArgv = [...process.argv];

  afterEach(() => {
    // Restore originals
    if (originalEnv === undefined) {
      delete process.env.LOOM_CONTEXT_DIR;
    } else {
      process.env.LOOM_CONTEXT_DIR = originalEnv;
    }
    process.argv = [...originalArgv];
  });

  it('returns the LOOM_CONTEXT_DIR env var when set', () => {
    process.env.LOOM_CONTEXT_DIR = '/tmp/test-context';
    // Clear CLI arg so it doesn't interfere
    process.argv = ['node', 'index.js'];

    expect(resolveContextDir()).toBe(resolve('/tmp/test-context'));
  });

  it('resolves a relative LOOM_CONTEXT_DIR to an absolute path', () => {
    process.env.LOOM_CONTEXT_DIR = './relative/path';
    process.argv = ['node', 'index.js'];

    const result = resolveContextDir();
    expect(result).toBe(resolve('./relative/path'));
    expect(result).toMatch(/^\//); // absolute
  });

  it('returns --context-dir CLI argument when env var is not set', () => {
    delete process.env.LOOM_CONTEXT_DIR;
    process.argv = ['node', 'index.js', '--context-dir', '/opt/loom-data'];

    expect(resolveContextDir()).toBe(resolve('/opt/loom-data'));
  });

  it('prefers env var over CLI argument', () => {
    process.env.LOOM_CONTEXT_DIR = '/from-env';
    process.argv = ['node', 'index.js', '--context-dir', '/from-cli'];

    expect(resolveContextDir()).toBe(resolve('/from-env'));
  });

  it('ignores --context-dir when it has no following value', () => {
    delete process.env.LOOM_CONTEXT_DIR;
    process.argv = ['node', 'index.js', '--context-dir'];

    // Should fall through to default
    expect(resolveContextDir()).toBe(
      resolve(homedir(), '.config', 'loom', 'default'),
    );
  });

  it('returns default ~/.config/loom/default when nothing is set', () => {
    delete process.env.LOOM_CONTEXT_DIR;
    process.argv = ['node', 'index.js'];

    expect(resolveContextDir()).toBe(
      resolve(homedir(), '.config', 'loom', 'default'),
    );
  });
});
