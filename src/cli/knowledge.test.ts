import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCaptured } from './test-helpers.js';
import { knowledgeWrite } from '../tools/knowledge-write.js';

describe('loom knowledge', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-cli-knowledge-'));
  });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  describe('routing', () => {
    it('exits 2 when no subcommand is given', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', '--context-dir', tempDir],
      );
      expect(code).toBe(2);
      expect(stdout).toMatch(/write|recall|maintain/i);
    });

    it('prints usage and exits 0 for --help', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', '--help', '--context-dir', tempDir],
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/write|recall|maintain/i);
    });

    it('exits 2 with message for unknown subcommand', async () => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'bogus', '--context-dir', tempDir],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/Unknown knowledge subcommand/i);
    });
  });

  describe('write', () => {
    it('writes a page with --body and prints human output', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir,
          '--title', 'Test Entity',
          '--domain', 'testing',
          '--body', 'Some content here'],
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/Test Entity/);
    });

    it('reads body from stdin when --body is omitted', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir,
          '--title', 'Stdin Entity',
          '--domain', 'testing'],
        { stdin: 'body from stdin pipe' },
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/Stdin Entity/);
    });

    it('emits KnowledgeWriteResult when --json', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir, '--json',
          '--title', 'JSON Entity',
          '--domain', 'testing',
          '--body', 'content'],
      );
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('uuid');
      expect(result).toHaveProperty('title', 'JSON Entity');
      expect(result).toHaveProperty('sourcing');
    });

    it('exits 2 when --title is missing', async () => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir,
          '--domain', 'testing',
          '--body', 'content'],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/--title/i);
    });

    it('exits 2 when --domain is missing', async () => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir,
          '--title', 'No Domain',
          '--body', 'content'],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/--domain/i);
    });

    it('exits 2 when body is empty (empty stdin, no --body)', async () => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir,
          '--title', 'Empty Body',
          '--domain', 'testing'],
        { stdin: '' },
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/--body/i);
    });

    it('exits 2 when --sourcing is an invalid value', async () => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir,
          '--title', 'Bad Sourcing',
          '--domain', 'testing',
          '--body', 'content',
          '--sourcing', 'unknown'],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/sourced|provisional/i);
    });

    it('exits 2 for an unknown flag', async () => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir,
          '--title', 'Bad Flag',
          '--domain', 'testing',
          '--body', 'content',
          '--not-a-flag', 'x'],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/not-a-flag|Unknown option/i);
    });

    it('derives slug from title when --slug is omitted', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'write', '--context-dir', tempDir, '--json',
          '--title', 'My Cool Entity',
          '--domain', 'testing',
          '--body', 'content'],
      );
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.slug).toBe('my-cool-entity');
    });
  });

  describe('recall', () => {
    beforeEach(async () => {
      await knowledgeWrite(tempDir, {
        title: 'Recall Target',
        domain: 'science',
        body: 'This is the recall target page body.',
      });
      await knowledgeWrite(tempDir, {
        title: 'Other Domain',
        domain: 'music',
        body: 'Different domain page.',
      });
    });

    it('returns pages in human format', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'recall', 'recall target', '--context-dir', tempDir],
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/Recall Target/);
    });

    it('emits KnowledgePage array when --json', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'recall', '--context-dir', tempDir, '--json'],
      );
      expect(code).toBe(0);
      const pages = JSON.parse(stdout);
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages[0]).toHaveProperty('slug');
      expect(pages[0]).toHaveProperty('title');
      expect(pages[0]).toHaveProperty('domain');
    });

    it('exits 0 with no-results message when query matches nothing', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'recall', 'zzznomatch999', '--context-dir', tempDir],
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/No knowledge pages found/i);
    });

    it('filters by --domain', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'recall', '--context-dir', tempDir, '--domain', 'science', '--json'],
      );
      expect(code).toBe(0);
      const pages = JSON.parse(stdout);
      expect(pages.every((p: { domain: string }) => p.domain.startsWith('science'))).toBe(true);
    });

    it.each(['abc', '0', '-5'])('exits 2 when --limit is %s', async (bad) => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'recall', '--context-dir', tempDir, `--limit=${bad}`],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/positive integer/i);
    });

    it('exits 2 for an unknown flag', async () => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'recall', '--context-dir', tempDir, '--not-a-flag'],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/not-a-flag|Unknown option/i);
    });
  });

  describe('maintain', () => {
    beforeEach(async () => {
      await knowledgeWrite(tempDir, {
        title: 'Maintain Test Page',
        domain: 'testing',
        body: 'Short body',
      });
    });

    it('returns a maintenance report in human format', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'maintain', '--context-dir', tempDir],
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/maintenance report|expansion|cold/i);
    });

    it('emits structured KnowledgeMaintainReport when --json', async () => {
      const { stdout, code } = await runCliCaptured(
        ['knowledge', 'maintain', '--context-dir', tempDir, '--json'],
      );
      expect(code).toBe(0);
      const report = JSON.parse(stdout);
      expect(report).toHaveProperty('expansionCandidates');
      expect(report).toHaveProperty('coldPages');
      expect(report).toHaveProperty('misfileAudit');
      expect(Array.isArray(report.expansionCandidates)).toBe(true);
    });

    it('accepts --thin-body, --min-hits, --cold-days without error', async () => {
      const { code } = await runCliCaptured(
        ['knowledge', 'maintain', '--context-dir', tempDir,
          '--thin-body', '500',
          '--min-hits', '1',
          '--cold-days', '7'],
      );
      expect(code).toBe(0);
    });

    it('exits 2 for an unknown flag', async () => {
      const { stderr, code } = await runCliCaptured(
        ['knowledge', 'maintain', '--context-dir', tempDir, '--not-a-flag'],
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/not-a-flag|Unknown option/i);
    });
  });
});
