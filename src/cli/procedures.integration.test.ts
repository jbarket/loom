import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runCliCaptured } from './test-helpers.js';
import { loadIdentity } from '../tools/identity.js';

describe('procedures — first-boot integration', () => {
  let ctx: string;
  beforeEach(async () => { ctx = await mkdtemp(join(tmpdir(), 'loom-proc-int-')); });
  afterEach(async () => { await rm(ctx, { recursive: true, force: true }); });

  it('list → adopt --all → identity → re-adopt', async () => {
    // 1. Fresh list — all 6 un-adopted
    const list1 = await runCliCaptured(
      ['procedures', 'list', '--json', '--context-dir', ctx],
    );
    expect(list1.code).toBe(0);
    const listed = JSON.parse(list1.stdout).available;
    expect(listed).toHaveLength(6);
    expect(listed.every((a: { adopted: boolean }) => a.adopted === false)).toBe(true);

    // 2. Adopt --all
    const adopt1 = await runCliCaptured(
      ['procedures', 'adopt', '--all', '--context-dir', ctx],
    );
    expect(adopt1.code).toBe(0);
    expect(adopt1.stdout.trim().split('\n')).toHaveLength(6);

    // 3. identity() now includes the procedures block
    const identity = await loadIdentity(ctx);
    expect(identity).toContain('# Procedures');
    expect(identity).toContain('verify-before-completion');
    expect(identity).toContain('⚠ This is a seed template'); // ownership ritual visible

    // 4. Re-adopt — all should report skipped-exists
    const adopt2 = await runCliCaptured(
      ['procedures', 'adopt', '--all', '--context-dir', ctx],
    );
    expect(adopt2.code).toBe(0);
    expect(adopt2.stdout.match(/skipped-exists/g)).toHaveLength(6);

    // 5. Files are readable
    const bodyA = await readFile(resolve(ctx, 'procedures', 'cold-testing.md'), 'utf-8');
    expect(bodyA).toContain('**Rule:**');
  });
});
