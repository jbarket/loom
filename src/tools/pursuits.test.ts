import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parsePursuits, serializePursuits, pursuits } from './pursuits.js';

const SEED = `# Pursuits

## Active
- **Chainsaw Man deep read** — Goal: Read all volumes, write analysis connecting contract mechanics to software design.
  - Started vol 1
  - Finished vol 1-2, contract system is fascinating

## Completed
- **Sophia paper analysis** — Goal: Read and map to loom architecture.
  Reason: Mapped all four pillars to loom tools. Memories written.

## Parked
- **Bytebeat explorer** — Goal: Build a web-based bytebeat playground.
  Reason: No clear direction emerged. May revisit when Norns arrives.
`;

describe('parsePursuits', () => {
  it('parses active pursuits with progress', () => {
    const data = parsePursuits(SEED);
    expect(data.active).toHaveLength(1);
    expect(data.active[0].name).toBe('Chainsaw Man deep read');
    expect(data.active[0].goal).toContain('Read all volumes');
    expect(data.active[0].progress).toHaveLength(2);
    expect(data.active[0].progress[0]).toContain('Started vol 1');
  });

  it('parses completed pursuits with reason', () => {
    const data = parsePursuits(SEED);
    expect(data.completed).toHaveLength(1);
    expect(data.completed[0].name).toBe('Sophia paper analysis');
    expect(data.completed[0].reason).toContain('Mapped all four pillars');
  });

  it('parses parked pursuits with reason', () => {
    const data = parsePursuits(SEED);
    expect(data.parked).toHaveLength(1);
    expect(data.parked[0].name).toBe('Bytebeat explorer');
    expect(data.parked[0].reason).toContain('No clear direction');
  });

  it('handles empty file', () => {
    const data = parsePursuits('');
    expect(data.active).toHaveLength(0);
    expect(data.completed).toHaveLength(0);
    expect(data.parked).toHaveLength(0);
  });

  it('handles file with no entries in sections', () => {
    const data = parsePursuits('## Active\n*Nothing*\n\n## Completed\n\n## Parked\n');
    expect(data.active).toHaveLength(0);
    expect(data.completed).toHaveLength(0);
    expect(data.parked).toHaveLength(0);
  });
});

describe('serializePursuits', () => {
  it('roundtrips through parse and serialize', () => {
    const original = parsePursuits(SEED);
    const serialized = serializePursuits(original);
    const reparsed = parsePursuits(serialized);
    expect(reparsed.active).toHaveLength(1);
    expect(reparsed.active[0].name).toBe('Chainsaw Man deep read');
    expect(reparsed.active[0].progress).toHaveLength(2);
    expect(reparsed.completed).toHaveLength(1);
    expect(reparsed.parked).toHaveLength(1);
  });

  it('includes placeholder text for empty sections', () => {
    const data = { active: [], completed: [], parked: [] };
    const text = serializePursuits(data);
    expect(text).toContain('Nothing active');
    expect(text).toContain('Nothing yet');
    expect(text).toContain('Nothing parked');
  });
});

describe('pursuits tool', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-pursuits-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ─── List ──────────────────────────────────────────────────────────────────

  it('list returns no pursuits when file does not exist', async () => {
    const result = await pursuits(tempDir, { action: 'list' });
    expect(result).toContain('No active pursuits');
  });

  it('list shows active pursuits with latest progress', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, { action: 'list' });
    expect(result).toContain('Chainsaw Man deep read');
    expect(result).toContain('Finished vol 1-2');
  });

  it('list shows parked pursuits', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, { action: 'list' });
    expect(result).toContain('Bytebeat explorer');
    expect(result).toContain('Parked');
  });

  it('list shows completed count', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, { action: 'list' });
    expect(result).toContain('Completed');
    expect(result).toContain('1 pursuit');
  });

  // ─── Add ───────────────────────────────────────────────────────────────────

  it('add creates a new active pursuit', async () => {
    const result = await pursuits(tempDir, {
      action: 'add',
      name: 'Norns scripting',
      goal: 'Write a generative grain engine in Lua',
    });
    expect(result).toContain('Added');
    expect(result).toContain('Norns scripting');

    const file = await readFile(join(tempDir, 'pursuits.md'), 'utf-8');
    expect(file).toContain('Norns scripting');
    expect(file).toContain('generative grain engine');
  });

  it('add with initial progress note', async () => {
    await pursuits(tempDir, {
      action: 'add',
      name: 'Test pursuit',
      goal: 'Test it',
      progress: 'Created the thing',
    });
    const file = await readFile(join(tempDir, 'pursuits.md'), 'utf-8');
    expect(file).toContain('Created the thing');
  });

  it('add requires a goal', async () => {
    const result = await pursuits(tempDir, { action: 'add', name: 'No goal' });
    expect(result).toContain('requires a goal');
  });

  it('add rejects duplicate names', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'add',
      name: 'Chainsaw Man deep read',
      goal: 'duplicate',
    });
    expect(result).toContain('already exists');
  });

  it('add requires a name', async () => {
    const result = await pursuits(tempDir, { action: 'add', goal: 'something' });
    expect(result).toContain('requires a pursuit name');
  });

  // ─── Update ────────────────────────────────────────────────────────────────

  it('update adds progress to an active pursuit', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'update',
      name: 'Chainsaw Man deep read',
      progress: 'Vol 3 done. Makima is terrifying.',
    });
    expect(result).toContain('Updated');
    expect(result).toContain('Vol 3 done');

    const file = await readFile(join(tempDir, 'pursuits.md'), 'utf-8');
    expect(file).toContain('Vol 3 done');
  });

  it('update requires progress', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'update',
      name: 'Chainsaw Man deep read',
    });
    expect(result).toContain('requires a progress note');
  });

  it('update rejects non-active pursuits', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'update',
      name: 'Bytebeat explorer',
      progress: 'tried again',
    });
    expect(result).toContain('parked');
    expect(result).toContain('resume');
  });

  it('update is case-insensitive on name', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'update',
      name: 'chainsaw man deep read',
      progress: 'case test',
    });
    expect(result).toContain('Updated');
  });

  // ─── Complete ──────────────────────────────────────────────────────────────

  it('complete moves pursuit to completed', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'complete',
      name: 'Chainsaw Man deep read',
      reason: 'Read everything. Analysis written.',
    });
    expect(result).toContain('Completed');

    const data = parsePursuits(await readFile(join(tempDir, 'pursuits.md'), 'utf-8'));
    expect(data.active).toHaveLength(0);
    expect(data.completed).toHaveLength(2); // original + newly completed
    expect(data.completed[1].reason).toContain('Read everything');
  });

  it('complete works without reason', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'complete',
      name: 'Chainsaw Man deep read',
    });
    expect(result).toContain('Completed');
  });

  // ─── Park ──────────────────────────────────────────────────────────────────

  it('park moves pursuit from active to parked', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'park',
      name: 'Chainsaw Man deep read',
      reason: 'Need a break from manga',
    });
    expect(result).toContain('Parked');

    const data = parsePursuits(await readFile(join(tempDir, 'pursuits.md'), 'utf-8'));
    expect(data.active).toHaveLength(0);
    expect(data.parked).toHaveLength(2);
  });

  it('park rejects already-parked pursuit', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'park',
      name: 'Bytebeat explorer',
    });
    expect(result).toContain('already parked');
  });

  // ─── Resume ────────────────────────────────────────────────────────────────

  it('resume moves parked pursuit to active', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'resume',
      name: 'Bytebeat explorer',
    });
    expect(result).toContain('Resumed');

    const data = parsePursuits(await readFile(join(tempDir, 'pursuits.md'), 'utf-8'));
    expect(data.active).toHaveLength(2);
    expect(data.parked).toHaveLength(0);
  });

  it('resume with progress note', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    await pursuits(tempDir, {
      action: 'resume',
      name: 'Bytebeat explorer',
      progress: 'Norns arrived, trying again',
    });
    const data = parsePursuits(await readFile(join(tempDir, 'pursuits.md'), 'utf-8'));
    const resumed = data.active.find(p => p.name === 'Bytebeat explorer');
    expect(resumed?.progress).toContain('Norns arrived, trying again');
  });

  it('resume rejects already-active pursuit', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'resume',
      name: 'Chainsaw Man deep read',
    });
    expect(result).toContain('already active');
  });

  it('resume can reactivate completed pursuit', async () => {
    await writeFile(join(tempDir, 'pursuits.md'), SEED);
    const result = await pursuits(tempDir, {
      action: 'resume',
      name: 'Sophia paper analysis',
    });
    expect(result).toContain('Resumed');
    const data = parsePursuits(await readFile(join(tempDir, 'pursuits.md'), 'utf-8'));
    expect(data.active).toHaveLength(2);
    expect(data.completed).toHaveLength(0);
  });
});
