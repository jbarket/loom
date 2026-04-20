/**
 * Procedures block reader.
 *
 * Procedural-identity docs live at `<contextDir>/procedures/*.md` —
 * short prescriptive rules for how this agent acts (verify, cold-test,
 * reflect, handoff). Hard cap at ~10 per stack spec v1 §4.9; `readAll`
 * emits a warning when the cap is exceeded so the wake sequence can
 * surface it in the identity payload.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFrontmatter, type Block } from './types.js';

const DIR = 'procedures';
const CAP = 10;

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

export async function readAll(contextDir: string): Promise<{
  blocks: Block[];
  capWarning: string | null;
}> {
  const keys = await list(contextDir);
  const blocks: Block[] = [];
  for (const key of keys) {
    const block = await read(contextDir, key);
    if (block) blocks.push(block);
  }
  const capWarning = blocks.length > CAP
    ? `Procedures cap exceeded: ${blocks.length} files present, cap is ${CAP}. ` +
      `Prune — this block has regressed toward agentskills. See stack spec v1 §4.9.`
    : null;
  return { blocks, capWarning };
}

export function template(key: string): string {
  return `# ${key}

<one-sentence rule>

## Why
<the reason — often a past incident or strong preference>

## How to apply
<when this kicks in, how to judge edge cases>
`;
}
