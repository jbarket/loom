import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveSkillSourcePath } from './skill-source.js';

export type WriteAction = 'created' | 'skipped-exists' | 'overwritten';

export interface WriteSkillResult {
  path: string;
  action: WriteAction;
}

export interface WriteSkillOpts {
  force?: boolean;
  dryRun?: boolean;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write the bundled SKILL.md to `dest`. Idempotent: when the
 * destination already has matching content, returns `skipped-exists`.
 * When content differs, returns `skipped-exists` unless `force: true`
 * (then `overwritten`). `dryRun: true` short-circuits all writes but
 * still reports the action that would have been taken.
 */
export async function writeSkill(
  dest: string,
  opts: WriteSkillOpts = {},
): Promise<WriteSkillResult> {
  const source = await readFile(resolveSkillSourcePath(), 'utf-8');
  const exists = await pathExists(dest);

  if (!exists) {
    if (!opts.dryRun) {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, source, 'utf-8');
    }
    return { path: dest, action: 'created' };
  }

  const current = await readFile(dest, 'utf-8');
  if (current === source) {
    return { path: dest, action: 'skipped-exists' };
  }
  if (!opts.force) {
    return { path: dest, action: 'skipped-exists' };
  }
  if (!opts.dryRun) {
    await writeFile(dest, source, 'utf-8');
  }
  return { path: dest, action: 'overwritten' };
}
