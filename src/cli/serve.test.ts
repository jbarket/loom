import { describe, it, expect } from 'vitest';
import { runCliCaptured } from './test-helpers.js';

describe('loom serve argv', () => {
  it('prints usage on --help without starting a server', async () => {
    const { stdout, stderr, code } = await runCliCaptured(['serve', '--help']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Usage: loom serve/);
    expect(stderr).toBe('');
  });

  it('prints usage on -h', async () => {
    const { stdout, code } = await runCliCaptured(['serve', '-h']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Usage: loom serve/);
  });

  it('rejects an unknown flag with exit 2 and usage on stderr', async () => {
    const { stdout, stderr, code } = await runCliCaptured(['serve', '--nope']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/Usage: loom serve/);
    expect(stdout).toBe('');
  });
});
