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

  describe('SEED_PROCEDURES', () => {
    const EXPECTED_KEYS = [
      'verify-before-completion',
      'cold-testing',
      'reflection-at-end-of-unit',
      'handoff-to-unpushable-repo',
      'confidence-calibration',
      'RLHF-resistance',
    ];

    it('has exactly the 6 canonical §4.9 keys', () => {
      expect(Object.keys(procedures.SEED_PROCEDURES).sort()).toEqual([...EXPECTED_KEYS].sort());
    });

    it('every seed template starts with "# <key>"', () => {
      for (const key of EXPECTED_KEYS) {
        const body = procedures.SEED_PROCEDURES[key];
        expect(body.startsWith(`# ${key}\n`)).toBe(true);
      }
    });

    it('every seed template contains a Rule line, the ⚠ notice, Why, and How to apply', () => {
      for (const key of EXPECTED_KEYS) {
        const body = procedures.SEED_PROCEDURES[key];
        expect(body).toContain('**Rule:**');
        expect(body).toContain('⚠');
        expect(body).toContain('## Why');
        expect(body).toContain('## How to apply');
      }
    });

    it('every rule sentence is under 200 characters', () => {
      for (const key of EXPECTED_KEYS) {
        const body = procedures.SEED_PROCEDURES[key];
        const match = body.match(/\*\*Rule:\*\* (.+?)(?:\n|$)/);
        expect(match, `missing Rule line in ${key}`).not.toBeNull();
        expect(
          match![1].length,
          `Rule for ${key} exceeds 200 chars (actual: ${match![1].length})`,
        ).toBeLessThan(200);
      }
    });
  });

  describe('seedNudge', () => {
    it('opens with the "# Procedures — seed nudge" header', () => {
      const nudge = procedures.seedNudge();
      expect(nudge.startsWith('# Procedures — seed nudge\n')).toBe(true);
    });

    it('mentions the empty directory and the §4.9 reference', () => {
      const nudge = procedures.seedNudge();
      expect(nudge).toContain('`procedures/` directory is empty');
      expect(nudge).toContain('§4.9');
    });

    it('includes every seed procedure with an h2 header', () => {
      const nudge = procedures.seedNudge();
      for (const key of Object.keys(procedures.SEED_PROCEDURES)) {
        expect(nudge, `nudge missing ## ${key}`).toContain(`## ${key}`);
      }
    });

    it('demotes the embedded templates from h1 to h2 (no secondary h1s)', () => {
      const nudge = procedures.seedNudge();
      const h1Matches = nudge.match(/^# /gm) ?? [];
      expect(h1Matches.length).toBe(1);
    });

    it('preserves each template body (rule, notice, Why, How to apply)', () => {
      const nudge = procedures.seedNudge();
      expect((nudge.match(/\*\*Rule:\*\*/g) ?? []).length).toBe(6);
      expect((nudge.match(/⚠/g) ?? []).length).toBe(7);
      expect((nudge.match(/## Why/g) ?? []).length).toBe(6);
      expect((nudge.match(/## How to apply/g) ?? []).length).toBe(6);
    });
  });
});
