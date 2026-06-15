/**
 * c-loom-memory: it-loom-salience — temperature decay/bump, recompute, digest assembly.
 * Greens ac-loom-salience-field, ac-loom-digest-assemble, ac-loom-digest-inject.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import BetterSqlite3 from 'better-sqlite3';
import {
  temperature,
  tierOf,
  assembleDigest,
  recomputeSalienceForContext,
  digestForContext,
  type DigestRow,
} from './salience.js';
import { remember } from '../tools/remember.js';
import { resolveSqliteDbPath } from '../config.js';

const NOW = Date.parse('2026-06-15T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('temperature (per-category half-life decay + access bump)', () => {
  it('is 1.0 at the moment of touch and 0.5 after one half-life', () => {
    expect(temperature(daysAgo(0), 'project', NOW)).toBeCloseTo(1.0, 5);
    expect(temperature(daysAgo(10), 'project', NOW)).toBeCloseTo(0.5, 2); // project half-life = 10d
    expect(temperature(daysAgo(90), 'user', NOW)).toBeCloseTo(0.5, 2); // user half-life = 90d
  });

  it('cools identity-level categories slower than working ones', () => {
    // same age, different category → user stays hotter than project
    expect(temperature(daysAgo(30), 'user', NOW)).toBeGreaterThan(temperature(daysAgo(30), 'project', NOW));
  });

  // The fixture order (fx-loom-salience-decay-bump): a just-recalled old atom is
  // hottest; an untouched old one is coldest; identity cools slowly in between.
  it('orders fresh / recalled / identity / untouched correctly', () => {
    const cases = {
      'fresh-project': temperature(daysAgo(1), 'project', NOW), // created 1d ago
      'old-untouched': temperature(daysAgo(60), 'project', NOW), // lastTouch = created, 60d
      'old-but-recalled': temperature(daysAgo(0), 'project', NOW), // last_accessed today
      'identity-fact': temperature(daysAgo(60), 'user', NOW), // user, 60d
    };
    const order = Object.entries(cases).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    expect(order).toEqual(['old-but-recalled', 'fresh-project', 'identity-fact', 'old-untouched']);
  });
});

describe('tierOf', () => {
  it('bands temperature into Hot/Warm/Cool', () => {
    expect(tierOf(0.9)).toBe('Hot');
    expect(tierOf(0.4)).toBe('Warm');
    expect(tierOf(0.05)).toBe('Cool');
  });
});

describe('assembleDigest (token-budget hottest-first, no generation)', () => {
  const rows: DigestRow[] = [
    { title: 'A', category: 'project', content: 'alpha body', salience: 0.9 },
    { title: 'B', category: 'self', content: 'beta body', salience: 0.5 },
    { title: 'C', category: 'reference', content: 'gamma body', salience: 0.05 },
  ];

  it('orders hottest-first and groups under tier headers', () => {
    const d = assembleDigest(rows)!;
    expect(d).toMatch(/Top of mind[\s\S]*\*\*A\*\*/); // Hot tier, atom A
    expect(d.indexOf('**A**')).toBeLessThan(d.indexOf('**B**')); // hottest first
    // it only ever emits the authored titles/content — never invented prose
    expect(d).toContain('alpha body');
    expect(d).not.toMatch(/synthesi|summary of|in conclusion/i);
  });

  it('respects the token budget (drops the coldest when over)', () => {
    const tiny = assembleDigest(rows, { tokenBudget: 12, charsPerToken: 1 })!; // ~12 chars
    expect(tiny).toContain('**A**'); // hottest kept
    expect(tiny).not.toContain('**C**'); // coldest dropped
  });

  it('returns null for an empty set', () => {
    expect(assembleDigest([])).toBeNull();
  });
});

describe('recompute + digest through the real store', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'loom-salience-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a fresh memory inserts hot (salience 1.0) and shows in the digest', async () => {
    await remember(tmpDir, { category: 'project', title: 'Live build', content: 'wiring the boot digest' });
    const digest = digestForContext(tmpDir);
    expect(digest).toContain('Live build');
    expect(digest).toMatch(/Top of mind/); // fresh = hot
  });

  it('recompute cools an aged, untouched memory below a fresh one', async () => {
    await remember(tmpDir, { category: 'project', title: 'Old thread', content: 'last month' });
    await remember(tmpDir, { category: 'project', title: 'New thread', content: 'today' });
    // Age the first one's timestamps by 60 days (simulate the passage of time).
    const db = new BetterSqlite3(resolveSqliteDbPath(tmpDir));
    db.prepare('UPDATE memories SET created = ?, updated = NULL, last_accessed = NULL WHERE title = ?')
      .run(daysAgo(60), 'Old thread');
    db.close();

    const n = recomputeSalienceForContext(tmpDir, NOW);
    expect(n).toBe(2);

    const check = new BetterSqlite3(resolveSqliteDbPath(tmpDir), { readonly: true });
    const rows = check.prepare('SELECT title, salience FROM memories ORDER BY salience DESC').all() as { title: string; salience: number }[];
    check.close();
    expect(rows[0].title).toBe('New thread'); // fresh outranks aged
    expect(rows[1].salience).toBeLessThan(rows[0].salience);
  });
});
