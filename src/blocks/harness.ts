/**
 * Harness manifest reader.
 *
 * Each harness an agent has ever sleeved into gets one manifest at
 * `<contextDir>/harnesses/<client>.md`. The manifest describes the
 * harness independently of the model running inside it — tool prefixes,
 * delegation primitive, scheduling, session search, known gotchas.
 *
 * Contract: stack spec v1 §4.7.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFrontmatter, type Block } from './types.js';

const DIR = 'harnesses';

export async function read(contextDir: string, key: string): Promise<Block | null> {
  const path = resolve(contextDir, DIR, `${key}.md`);
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf-8');
  if (raw.trim() === '') return null;
  const { frontmatter, body } = parseFrontmatter(raw);
  return { key, frontmatter, body: body.trim(), path };
}

export async function list(contextDir: string): Promise<string[]> {
  const path = resolve(contextDir, DIR);
  if (!existsSync(path)) return [];
  const entries = await readdir(path);
  return entries
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -'.md'.length))
    .sort();
}

export function template(key: string): string {
  return `---
harness: ${key}
version: 0.4
---

## Tool prefixes
<tool-prefix list — see stack spec §4.7>

## Delegation primitive
<primary sub-agent mechanism>

## Cron / scheduling
<scheduling primitive if any, and local-vs-UTC note>

## Session search
<how transcripts are searched>

## Gotchas
<known quirks>
`;
}
