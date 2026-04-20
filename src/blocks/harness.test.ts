import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as harness from './harness.js';

describe('blocks/harness', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'loom-harness-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('returns null when harnesses/ directory does not exist', async () => {
      expect(await harness.read(dir, 'claude-code')).toBeNull();
    });

    it('returns null when the specific manifest is missing', async () => {
      await mkdir(join(dir, 'harnesses'), { recursive: true });
      expect(await harness.read(dir, 'claude-code')).toBeNull();
    });

    it('returns null when the manifest file is empty', async () => {
      await mkdir(join(dir, 'harnesses'), { recursive: true });
      await writeFile(join(dir, 'harnesses', 'claude-code.md'), '');
      expect(await harness.read(dir, 'claude-code')).toBeNull();
    });

    it('returns a Block with parsed frontmatter and trimmed body', async () => {
      await mkdir(join(dir, 'harnesses'), { recursive: true });
      await writeFile(
        join(dir, 'harnesses', 'claude-code.md'),
        '---\nharness: claude-code\nversion: 0.4\n---\n\n## Tool prefixes\nmcp__loom__*\n',
      );
      const block = await harness.read(dir, 'claude-code');
      expect(block).not.toBeNull();
      expect(block?.key).toBe('claude-code');
      expect(block?.frontmatter).toEqual({ harness: 'claude-code', version: '0.4' });
      expect(block?.body).toContain('## Tool prefixes');
      expect(block?.path).toBe(join(dir, 'harnesses', 'claude-code.md'));
    });

    it('returns a Block with empty frontmatter when file has none', async () => {
      await mkdir(join(dir, 'harnesses'), { recursive: true });
      await writeFile(join(dir, 'harnesses', 'claude-code.md'), '## Tool prefixes\nmcp__loom__*\n');
      const block = await harness.read(dir, 'claude-code');
      expect(block?.frontmatter).toEqual({});
      expect(block?.body).toContain('## Tool prefixes');
    });
  });

  describe('list', () => {
    it('returns [] when harnesses/ is missing', async () => {
      expect(await harness.list(dir)).toEqual([]);
    });

    it('returns sorted keys for present manifests', async () => {
      await mkdir(join(dir, 'harnesses'), { recursive: true });
      await writeFile(join(dir, 'harnesses', 'hermes.md'), '# hermes');
      await writeFile(join(dir, 'harnesses', 'claude-code.md'), '# claude-code');
      await writeFile(join(dir, 'harnesses', 'not-a-manifest.txt'), 'skip me');
      expect(await harness.list(dir)).toEqual(['claude-code', 'hermes']);
    });
  });

  describe('template', () => {
    it('returns a template string containing the supplied key in the frontmatter', () => {
      const tpl = harness.template('claude-code');
      expect(tpl).toContain('harness: claude-code');
      expect(tpl).toContain('## Tool prefixes');
      expect(tpl).toContain('## Delegation primitive');
      expect(tpl).toContain('## Cron / scheduling');
      expect(tpl).toContain('## Session search');
      expect(tpl).toContain('## Gotchas');
    });
  });
});
