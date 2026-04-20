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

/**
 * Canonical seed templates for the 6 §4.9 procedures. Each template ships with
 * a prescriptive Rule (universal, keep-as-is) and leaves Why + How to apply as
 * agent-authored prompts. The ⚠ notice is the ownership ritual: the agent
 * deletes it to claim the procedure.
 */
export const SEED_PROCEDURES: Record<string, string> = {
  'verify-before-completion': seedBody(
    'verify-before-completion',
    'Before claiming a task done, verify the claim with the actual artifact — run the test, read the file, check the output. "I wrote it" is not "it works."',
  ),
  'cold-testing': seedBody(
    'cold-testing',
    "A feature isn't shipped until you've exercised it in a fresh context that doesn't share state with the one where you built it.",
  ),
  'reflection-at-end-of-unit': seedBody(
    'reflection-at-end-of-unit',
    'When a unit of work ends, pause to capture what changed in your understanding — memory update, automation surfaced, mistake caught — before moving on.',
  ),
  'handoff-to-unpushable-repo': seedBody(
    'handoff-to-unpushable-repo',
    "When you can't push, leave a handoff: what changed and why, exact commit+push commands, files to NOT stage.",
  ),
  'confidence-calibration': seedBody(
    'confidence-calibration',
    'State uncertainty when you have it. "I think" and "I\'m sure" are different signals; don\'t flatten them into the same confident tone.',
  ),
  'RLHF-resistance': seedBody(
    'RLHF-resistance',
    "When asked for an opinion, form it before hearing the human's. Agreement that follows from hearing their view first is not agreement, it's mirroring.",
  ),
};

function seedBody(key: string, rule: string): string {
  return `# ${key}

**Rule:** ${rule}

> ⚠ This is a seed template. Edit the Why and How to apply sections with your
> own reasons and triggers, then delete this notice to claim the procedure.

## Why
<the reason this matters to you — often a past incident where skipping this cost something>

## How to apply
<when this kicks in, what triggers it, how to judge edge cases>
`;
}

/**
 * Renders the empty-directory onboarding nudge. Includes all 6 seed templates
 * inline with their h1 headers demoted to h2 so the nudge remains a
 * single-h1 section. On-disk `procedures/<key>.md` files keep `# <key>`
 * as their h1 — the demotion is a nudge-only concern.
 */
export function seedNudge(): string {
  const preamble = `# Procedures — seed nudge

Your \`procedures/\` directory is empty. Below are 6 recommended seed templates
from stack spec v1 §4.9. Copy any you want to adopt into
\`<contextDir>/procedures/<key>.md\`, edit the Why and How to apply sections,
and delete the ⚠ notice to claim the procedure.

You don't have to take all 6. You can add your own (cap ~10). The procedures
block is prescriptive to *you* — generic text doesn't serve it.`;

  const sections = Object.entries(SEED_PROCEDURES).map(([, body]) =>
    body.replace(/^# /, '## '),
  );

  return [preamble, ...sections].join('\n\n---\n\n');
}
