import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { knowledgeMaintain, formatMaintainReport } from './knowledge-maintain.js';
import { SqliteKnowledgeBackend } from '../backends/sqlite-knowledge.js';

describe('knowledgeMaintain tool', () => {
  let tmpDir: string;
  let backend: SqliteKnowledgeBackend;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'loom-km-tool-'));
    backend = new SqliteKnowledgeBackend({ dbPath: join(tmpDir, 'knowledge.db') });
  });

  afterEach(() => {
    backend.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty report when no pages exist', async () => {
    const out = await knowledgeMaintain(tmpDir);
    expect(out).toContain('# Knowledge maintenance report');
    expect(out).toContain('Expansion candidates');
    expect(out).toContain('Cold pages');
    expect(out).toContain('Misfile audit');
  });

  it('surfaces expansion candidates (thin body + high hits)', async () => {
    await backend.writePage({
      slug: 'thin-hot',
      title: 'Thin Hot Page',
      domain: 'music',
      body: 'Short.',
    });

    // Manually bump hit_count to 5
    const db = backend['ensureOpen']();
    db.prepare('UPDATE pages SET hit_count = 5 WHERE slug = ?').run('thin-hot');

    const out = await knowledgeMaintain(tmpDir, {
      thinBodyThreshold: 100,
      expansionMinHits: 3,
    });
    expect(out).toContain('thin-hot');
    expect(out).toContain('Thin Hot Page');
  });

  it('does not surface pages above body threshold as expansion candidates', async () => {
    await backend.writePage({
      slug: 'fat-hot',
      title: 'Fat Hot Page',
      domain: 'music',
      body: 'x'.repeat(2000),
    });
    const db = backend['ensureOpen']();
    db.prepare('UPDATE pages SET hit_count = 10 WHERE slug = ?').run('fat-hot');

    const out = await knowledgeMaintain(tmpDir, {
      thinBodyThreshold: 1000,
      expansionMinHits: 3,
    });
    // fat-hot may appear in Cold pages (never accessed), but NOT in Expansion candidates
    const lines = out.split('\n');
    const expansionStart = lines.findIndex((l) => l.includes('Expansion candidates'));
    const coldStart = lines.findIndex((l) => l.includes('Cold pages'));
    const expansionSection = lines.slice(expansionStart, coldStart).join('\n');
    expect(expansionSection).not.toContain('fat-hot');
  });

  it('surfaces cold pages (not recently accessed)', async () => {
    await backend.writePage({
      slug: 'cold-page',
      title: 'Cold Page',
      domain: 'music',
      body: 'Never accessed.',
    });

    const out = await knowledgeMaintain(tmpDir, { coldDays: 1 });
    expect(out).toContain('cold-page');
    expect(out).toContain('Cold Page');
    expect(out).toContain('never');
  });

  it('does not surface recently accessed pages as cold', async () => {
    await backend.writePage({
      slug: 'warm-page',
      title: 'Warm Page',
      domain: 'music',
      body: 'Recently accessed.',
    });
    // Touch it now
    const db = backend['ensureOpen']();
    db.prepare(
      'UPDATE pages SET last_accessed = ? WHERE slug = ?',
    ).run(new Date().toISOString(), 'warm-page');

    const out = await knowledgeMaintain(tmpDir, { coldDays: 30 });
    expect(out).not.toContain('warm-page');
  });

  it('surfaces misfile candidates (all citations are conversation)', async () => {
    await backend.writePage({
      slug: 'misfile-candidate',
      title: 'Misfile Candidate',
      domain: 'music',
      body: 'Likely a memory.',
      citations: [
        {
          claim: 'Jonathan said he loves this',
          source_kind: 'conversation',
          excerpt: 'I love this synth',
        },
      ],
    });

    const out = await knowledgeMaintain(tmpDir);
    expect(out).toContain('misfile-candidate');
    expect(out).toContain('Misfile Candidate');
  });

  it('does not surface pages with mixed citations as misfile candidates', async () => {
    await backend.writePage({
      slug: 'mixed-citations',
      title: 'Mixed Citations',
      domain: 'music',
      body: 'Has both web and conversation.',
      citations: [
        { claim: 'A fact', source_kind: 'web', excerpt: 'Source says so.' },
        { claim: 'Also said', source_kind: 'conversation', excerpt: 'I said this.' },
      ],
    });

    const out = await knowledgeMaintain(tmpDir);
    // mixed-citations may appear in Cold pages, but NOT in Misfile audit
    const lines = out.split('\n');
    const misfileStart = lines.findIndex((l) => l.includes('Misfile audit'));
    const misfileSection = lines.slice(misfileStart).join('\n');
    expect(misfileSection).not.toContain('mixed-citations');
  });

  it('does not surface archived pages in any report section', async () => {
    await backend.writePage({
      slug: 'archived',
      title: 'Archived Page',
      domain: 'music',
      body: 'x',
    });
    const db = backend['ensureOpen']();
    db.prepare("UPDATE pages SET status = 'archived', hit_count = 100 WHERE slug = ?").run('archived');

    const out = await knowledgeMaintain(tmpDir);
    expect(out).not.toContain('archived');
  });

  it('closes the backend even on error', async () => {
    backend.close();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(tmpDir, 'knowledge.db'), 'NOT A DB');

    await expect(knowledgeMaintain(tmpDir)).rejects.toThrow();
  });
});

describe('formatMaintainReport', () => {
  it('renders all three sections with counts', () => {
    const out = formatMaintainReport({
      expansionCandidates: [
        { slug: 'thin-pg', title: 'Thin', domain: 'music', bodyLength: 50, hitCount: 10 },
      ],
      coldPages: [
        { slug: 'cold-pg', title: 'Cold', domain: 'music', lastAccessed: null, hitCount: 0 },
      ],
      misfileAudit: [
        { slug: 'mis-pg', title: 'Misfiled', domain: 'music', reason: 'all conversation' },
      ],
    });
    expect(out).toContain('Expansion candidates');
    expect(out).toContain('thin-pg');
    expect(out).toContain('Cold pages');
    expect(out).toContain('cold-pg');
    expect(out).toContain('never'); // last_accessed = null
    expect(out).toContain('Misfile audit');
    expect(out).toContain('mis-pg');
  });
});
