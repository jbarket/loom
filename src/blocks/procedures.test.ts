import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as procedures from './procedures.js';

describe('blocks/procedures', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'loom-procedures-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('list returns [] and readAll returns empty blocks when procedures/ is missing', async () => {
    expect(await procedures.list(dir)).toEqual([]);
    const all = await procedures.readAll(dir);
    expect(all.blocks).toEqual([]);
    expect(all.capWarning).toBeNull();
  });

  it('readAll returns blocks sorted alphabetically by key', async () => {
    await mkdir(join(dir, 'procedures'), { recursive: true });
    await writeFile(join(dir, 'procedures', 'reflection-at-end-of-unit.md'), '# Reflection');
    await writeFile(join(dir, 'procedures', 'cold-testing.md'), '# Cold testing');
    const all = await procedures.readAll(dir);
    expect(all.blocks.map((b) => b.key)).toEqual(['cold-testing', 'reflection-at-end-of-unit']);
    expect(all.capWarning).toBeNull();
  });

  it('readAll emits a cap warning when >10 procedures are present', async () => {
    await mkdir(join(dir, 'procedures'), { recursive: true });
    for (let i = 0; i < 11; i++) {
      await writeFile(join(dir, 'procedures', `proc-${i.toString().padStart(2, '0')}.md`), `# ${i}`);
    }
    const all = await procedures.readAll(dir);
    expect(all.blocks.length).toBe(11);
    expect(all.capWarning).not.toBeNull();
    expect(all.capWarning).toMatch(/11/);
    expect(all.capWarning).toMatch(/cap/i);
  });

  it('readAll skips empty files', async () => {
    await mkdir(join(dir, 'procedures'), { recursive: true });
    await writeFile(join(dir, 'procedures', 'empty.md'), '');
    await writeFile(join(dir, 'procedures', 'ok.md'), '# OK');
    const all = await procedures.readAll(dir);
    expect(all.blocks.map((b) => b.key)).toEqual(['ok']);
  });

  it('read returns a single procedure by key', async () => {
    await mkdir(join(dir, 'procedures'), { recursive: true });
    await writeFile(
      join(dir, 'procedures', 'verify-before-completion.md'),
      '---\ntitle: Verify\n---\n\n## Rule\nAlways verify.\n',
    );
    const block = await procedures.read(dir, 'verify-before-completion');
    expect(block?.key).toBe('verify-before-completion');
    expect(block?.frontmatter.title).toBe('Verify');
    expect(block?.body).toContain('## Rule');
  });

  it('template contains the key in the first header', () => {
    const tpl = procedures.template('verify-before-completion');
    expect(tpl).toContain('verify-before-completion');
    expect(tpl.toLowerCase()).toContain('why');
  });
});
