import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { knowledgeWrite } from './knowledge-write.js';
import { createKnowledgeBackend } from '../backends/index.js';

describe('knowledgeWrite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'loom-kw-'));
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes a page with web citation and returns success message', async () => {
    const result = await knowledgeWrite(tempDir, {
      domain: 'music/eurorack',
      title: 'Mutable Instruments Rings',
      body: 'Modal synthesizer module. Physical modelling resonator.',
      citations: [
        {
          claim: 'Rings uses physical modelling',
          source_kind: 'web',
          source_locator: 'https://mutable-instruments.net/modules/rings/',
          excerpt: 'Rings is a resonator module based on physical modelling.',
        },
      ],
    });

    expect(result).toMatch(/mutable-instruments-rings/);
    expect(result).toMatch(/Sourcing: sourced/);
    expect(result).not.toMatch(/Provisional/i);
  });

  it('stores conversation-only citations as provisional (§E1 gate)', async () => {
    const result = await knowledgeWrite(tempDir, {
      domain: 'music/eurorack',
      title: 'Patch Session Notes',
      body: 'We discovered that running Rings into Clouds creates lush textures.',
      citations: [
        {
          claim: 'Rings into Clouds = lush textures',
          source_kind: 'conversation',
          source_locator: 'session/2026-05-30',
          excerpt: 'That combo sounded great.',
        },
      ],
    });

    expect(result).toMatch(/Provisional/i);
    expect(result).toMatch(/provisional/i);

    // Verify backend state
    const backend = createKnowledgeBackend(tempDir);
    try {
      const page = await backend.getPage('patch-session-notes');
      expect(page).not.toBeNull();
      expect(page!.sourcing).toBe('provisional');
    } finally {
      backend.close();
    }
  });

  it('stores sourced when at least one non-conversation citation exists', async () => {
    const result = await knowledgeWrite(tempDir, {
      domain: 'music/eurorack',
      title: 'Mutable Plaits',
      body: 'Macro-oscillator module with many synthesis engines.',
      citations: [
        {
          claim: 'Plaits has 16 synthesis engines',
          source_kind: 'web',
          source_locator: 'https://mutable-instruments.net/modules/plaits/',
          excerpt: 'Sixteen synthesis engines.',
        },
        {
          claim: 'I prefer the modal engine',
          source_kind: 'conversation',
          source_locator: 'session/abc',
          excerpt: 'modal sounds best to me',
        },
      ],
    });

    expect(result).toMatch(/Sourcing: sourced/);

    const backend = createKnowledgeBackend(tempDir);
    try {
      const page = await backend.getPage('mutable-plaits');
      expect(page!.sourcing).toBe('sourced');
    } finally {
      backend.close();
    }
  });

  it('returns error when no citations provided', async () => {
    const result = await knowledgeWrite(tempDir, {
      domain: 'test',
      title: 'No Citations',
      body: 'Some content',
      citations: [],
    });

    expect(result).toMatch(/Error/i);
    expect(result).toMatch(/citation/i);
  });

  it('upserts an existing page by slug', async () => {
    await knowledgeWrite(tempDir, {
      slug: 'rings-module',
      domain: 'music/eurorack',
      title: 'Rings',
      body: 'Original body.',
      citations: [
        {
          claim: 'Rings is a resonator',
          source_kind: 'web',
          source_locator: 'https://mutable-instruments.net/modules/rings/',
          excerpt: 'Resonator module.',
        },
      ],
    });

    const result2 = await knowledgeWrite(tempDir, {
      slug: 'rings-module',
      domain: 'music/eurorack',
      title: 'Rings (updated)',
      body: 'Updated body with more detail.',
      citations: [
        {
          claim: 'Rings can self-oscillate',
          source_kind: 'web',
          source_locator: 'https://mutable-instruments.net/modules/rings/',
          excerpt: 'In some modes Rings self-oscillates.',
        },
      ],
    });

    expect(result2).toMatch(/rings-module/);
    expect(result2).toMatch(/Citations added: 1/);
  });

  it('auto-derives slug from title', async () => {
    const result = await knowledgeWrite(tempDir, {
      domain: 'music',
      title: 'Buchla vs Moog: Voltage Control Philosophies',
      body: 'Buchla uses positive gates; Moog uses negative.',
      citations: [
        {
          claim: 'Buchla uses positive voltage',
          source_kind: 'web',
          source_locator: 'https://example.com/buchla',
          excerpt: 'Buchla East Coast uses positive voltage control.',
        },
      ],
    });

    expect(result).toMatch(/buchla-vs-moog/);
  });

  it('rejects body exceeding hard cap', async () => {
    const result = await knowledgeWrite(tempDir, {
      domain: 'test',
      title: 'Large Page',
      body: 'x'.repeat(65 * 1024),
      citations: [
        {
          claim: 'big claim',
          source_kind: 'web',
          source_locator: 'https://example.com',
          excerpt: 'excerpt',
        },
      ],
    });

    expect(result).toMatch(/Error/i);
  });
});
