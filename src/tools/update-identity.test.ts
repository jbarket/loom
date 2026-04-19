import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSections, rebuildMarkdown, updateIdentity, listSections } from './update-identity.js';

describe('parseSections', () => {
  it('parses sections from markdown with H2 headers', () => {
    const text = '# Title\n\n## Strengths\n- Good at X\n- Good at Y\n\n## Learning\n- Working on Z\n';
    const sections = parseSections(text);
    expect(sections).toHaveLength(3); // preamble + 2 H2s
    expect(sections[0].header).toBe('');
    expect(sections[0].content).toContain('# Title');
    expect(sections[1].header).toBe('Strengths');
    expect(sections[1].content).toContain('Good at X');
    expect(sections[2].header).toBe('Learning');
    expect(sections[2].content).toContain('Working on Z');
  });

  it('handles file with no H2 sections', () => {
    const text = 'Just some text\nWith no headers\n';
    const sections = parseSections(text);
    expect(sections).toHaveLength(1);
    expect(sections[0].header).toBe('');
    expect(sections[0].content).toContain('Just some text');
  });

  it('handles empty file', () => {
    const sections = parseSections('');
    expect(sections).toHaveLength(1);
    expect(sections[0].header).toBe('');
    expect(sections[0].content).toBe('');
  });

  it('handles adjacent H2 headers with no content between', () => {
    const text = '## First\n## Second\nContent here\n';
    const sections = parseSections(text);
    expect(sections).toHaveLength(3); // preamble + 2 H2s
    expect(sections[1].header).toBe('First');
    expect(sections[1].content).toBe('');
    expect(sections[2].header).toBe('Second');
    expect(sections[2].content).toContain('Content here');
  });
});

describe('rebuildMarkdown', () => {
  it('roundtrips through parse and rebuild', () => {
    const original = '# Self-Model\n\n## Strengths\n- Good at X\n\n## Learning\n- Working on Z\n';
    const sections = parseSections(original);
    const rebuilt = rebuildMarkdown(sections);
    // Should preserve structure (exact whitespace may differ slightly)
    expect(rebuilt).toContain('# Self-Model');
    expect(rebuilt).toContain('## Strengths');
    expect(rebuilt).toContain('- Good at X');
    expect(rebuilt).toContain('## Learning');
    expect(rebuilt).toContain('- Working on Z');
  });

  it('handles sections with no preamble', () => {
    const sections = [
      { header: '', content: '', startLine: 0, endLine: 0 },
      { header: 'Only Section', content: 'Some content', startLine: 1, endLine: 2 },
    ];
    const result = rebuildMarkdown(sections);
    expect(result).toContain('## Only Section');
    expect(result).toContain('Some content');
    expect(result).not.toMatch(/^\n/); // no leading blank line from empty preamble
  });
});

describe('listSections', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-update-identity-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('lists sections from an existing file', async () => {
    await writeFile(join(tempDir, 'self-model.md'), '# Self-Model\n\n## Strengths\n- X\n\n## Learning\n- Y\n');
    const result = await listSections(tempDir, 'self-model');
    expect(result).toContain('Strengths');
    expect(result).toContain('Learning');
  });

  it('returns error for unknown file', async () => {
    const result = await listSections(tempDir, 'identity');
    expect(result).toContain('Unknown file');
    expect(result).toContain('self-model');
    expect(result).toContain('preferences');
  });

  it('returns helpful message when file does not exist', async () => {
    const result = await listSections(tempDir, 'self-model');
    expect(result).toContain('not found');
    expect(result).toContain('created');
  });

  it('handles file with no H2 sections', async () => {
    await writeFile(join(tempDir, 'self-model.md'), 'Just text, no sections');
    const result = await listSections(tempDir, 'self-model');
    expect(result).toContain('no H2 sections');
  });
});

describe('updateIdentity', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-update-identity-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('rejects unknown file names', async () => {
    const result = await updateIdentity(tempDir, {
      file: 'identity',
      section: 'Foo',
      content: 'bar',
    });
    expect(result).toContain('Unknown file');
  });

  it('lists sections when no section or content provided', async () => {
    await writeFile(join(tempDir, 'self-model.md'), '## Strengths\n- X\n\n## Learning\n- Y\n');
    const result = await updateIdentity(tempDir, { file: 'self-model' });
    expect(result).toContain('Strengths');
    expect(result).toContain('Learning');
  });

  it('requires content when section is specified', async () => {
    const result = await updateIdentity(tempDir, {
      file: 'self-model',
      section: 'Strengths',
    });
    expect(result).toContain('Content is required');
  });

  it('requires section when content is specified', async () => {
    const result = await updateIdentity(tempDir, {
      file: 'self-model',
      content: 'some stuff',
    });
    expect(result).toContain('Section name is required');
  });

  it('creates file when it does not exist', async () => {
    const result = await updateIdentity(tempDir, {
      file: 'self-model',
      section: 'Strengths',
      content: '- TypeScript\n- Node.js',
    });
    expect(result).toContain('Created');
    const written = await readFile(join(tempDir, 'self-model.md'), 'utf-8');
    expect(written).toContain('## Strengths');
    expect(written).toContain('- TypeScript');
  });

  it('replaces an existing section', async () => {
    await writeFile(join(tempDir, 'self-model.md'),
      '# Self-Model\n\n## Strengths\n- Old stuff\n\n## Learning\n- Old learning\n');

    const result = await updateIdentity(tempDir, {
      file: 'self-model',
      section: 'Strengths',
      content: '- New stuff\n- Better stuff',
    });
    expect(result).toContain('Updated section "Strengths"');

    const written = await readFile(join(tempDir, 'self-model.md'), 'utf-8');
    expect(written).toContain('- New stuff');
    expect(written).toContain('- Better stuff');
    expect(written).not.toContain('- Old stuff');
    // Other sections should be preserved
    expect(written).toContain('## Learning');
    expect(written).toContain('- Old learning');
  });

  it('section matching is case-insensitive', async () => {
    await writeFile(join(tempDir, 'self-model.md'), '## Current Focus\n- Loom\n');
    const result = await updateIdentity(tempDir, {
      file: 'self-model',
      section: 'current focus',
      content: '- New focus',
    });
    expect(result).toContain('Updated');
    const written = await readFile(join(tempDir, 'self-model.md'), 'utf-8');
    expect(written).toContain('- New focus');
  });

  it('returns error when replacing nonexistent section', async () => {
    await writeFile(join(tempDir, 'self-model.md'), '## Strengths\n- X\n');
    const result = await updateIdentity(tempDir, {
      file: 'self-model',
      section: 'Nonexistent',
      content: '- Y',
    });
    expect(result).toContain('not found');
    expect(result).toContain('Strengths');
    expect(result).toContain('append');
  });

  it('appends a new section', async () => {
    await writeFile(join(tempDir, 'self-model.md'), '## Strengths\n- X\n');
    const result = await updateIdentity(tempDir, {
      file: 'self-model',
      section: 'Weaknesses',
      content: '- Overthinking',
      mode: 'append',
    });
    expect(result).toContain('Appended');

    const written = await readFile(join(tempDir, 'self-model.md'), 'utf-8');
    expect(written).toContain('## Strengths');
    expect(written).toContain('## Weaknesses');
    expect(written).toContain('- Overthinking');
  });

  it('rejects append when section already exists', async () => {
    await writeFile(join(tempDir, 'self-model.md'), '## Strengths\n- X\n');
    const result = await updateIdentity(tempDir, {
      file: 'self-model',
      section: 'Strengths',
      content: '- Y',
      mode: 'append',
    });
    expect(result).toContain('already exists');
    expect(result).toContain('replace');
  });

  it('preserves preamble content when updating sections', async () => {
    await writeFile(join(tempDir, 'self-model.md'),
      '# Self-Model\n\n## Strengths\n- X\n\n## Learning\n- Y\n');

    await updateIdentity(tempDir, {
      file: 'self-model',
      section: 'Learning',
      content: '- Updated learning',
    });

    const written = await readFile(join(tempDir, 'self-model.md'), 'utf-8');
    expect(written).toContain('# Self-Model');
    expect(written).toContain('## Strengths');
    expect(written).toContain('- X');
    expect(written).toContain('- Updated learning');
  });

  it('works with preferences file', async () => {
    await writeFile(join(tempDir, 'preferences.md'),
      '## Communication Style\n- Direct\n\n## Technical Preferences\n- TypeScript\n');

    const result = await updateIdentity(tempDir, {
      file: 'preferences',
      section: 'Technical Preferences',
      content: '- TypeScript\n- Rust',
    });
    expect(result).toContain('Updated');

    const written = await readFile(join(tempDir, 'preferences.md'), 'utf-8');
    expect(written).toContain('- Rust');
    expect(written).toContain('## Communication Style');
    expect(written).toContain('- Direct');
  });
});
