/**
 * Pursuits tool — manages active interests, goals, and creative threads.
 *
 * Pursuits are lightweight goal tracking for free-time work and personal interests.
 * They provide continuity across sessions — each pursuit has a name, goal, status,
 * and progress log. The free-time task reads this file at the start of every session
 * so Art knows where things stand.
 *
 * This tool can be called from ANY session, not just free time. If something
 * interesting comes up in conversation, tuck it into pursuits right away.
 *
 * The file lives at `contextDir/pursuits.md` and is plain markdown — human-readable,
 * human-editable, no database needed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Pursuit {
  name: string;
  goal: string;
  status: 'active' | 'completed' | 'parked';
  progress: string[];
  reason?: string; // why it was completed or parked
}

export interface PursuitsFile {
  active: Pursuit[];
  completed: Pursuit[];
  parked: Pursuit[];
}

/**
 * Parse pursuits.md into structured data.
 */
export function parsePursuits(text: string): PursuitsFile {
  const result: PursuitsFile = { active: [], completed: [], parked: [] };
  let currentSection: 'active' | 'completed' | 'parked' | null = null;
  let currentPursuit: Pursuit | null = null;

  const lines = text.split('\n');

  for (const line of lines) {
    // Detect section headers
    if (line.startsWith('## Active')) {
      flushPursuit(result, currentPursuit);
      currentPursuit = null;
      currentSection = 'active';
      continue;
    }
    if (line.startsWith('## Completed')) {
      flushPursuit(result, currentPursuit);
      currentPursuit = null;
      currentSection = 'completed';
      continue;
    }
    if (line.startsWith('## Parked')) {
      flushPursuit(result, currentPursuit);
      currentPursuit = null;
      currentSection = 'parked';
      continue;
    }

    if (!currentSection) continue;

    // Detect pursuit entry: "- **Name** — Goal: ..."
    const pursuitMatch = line.match(/^- \*\*(.+?)\*\*\s*—\s*Goal:\s*(.+)/);
    if (pursuitMatch) {
      flushPursuit(result, currentPursuit);
      currentPursuit = {
        name: pursuitMatch[1],
        goal: pursuitMatch[2].trim(),
        status: currentSection,
        progress: [],
      };
      continue;
    }

    // Detect reason line (for completed/parked)
    const reasonMatch = line.match(/^\s+Reason:\s*(.+)/);
    if (reasonMatch && currentPursuit) {
      currentPursuit.reason = reasonMatch[1].trim();
      continue;
    }

    // Detect progress line: "  - Progress: ..."
    const progressMatch = line.match(/^\s+- Progress:\s*(.+)/);
    if (progressMatch && currentPursuit) {
      currentPursuit.progress.push(progressMatch[1].trim());
      continue;
    }

    // Detect continuation progress lines: "  - ..."
    const continuationMatch = line.match(/^\s+- (.+)/);
    if (continuationMatch && currentPursuit) {
      currentPursuit.progress.push(continuationMatch[1].trim());
      continue;
    }
  }

  // Flush last pursuit
  flushPursuit(result, currentPursuit);

  return result;
}

function flushPursuit(file: PursuitsFile, pursuit: Pursuit | null): void {
  if (!pursuit) return;
  file[pursuit.status].push(pursuit);
}

/**
 * Serialize pursuits back to markdown.
 */
export function serializePursuits(data: PursuitsFile): string {
  const lines: string[] = ['# Pursuits', ''];

  lines.push('## Active');
  if (data.active.length === 0) {
    lines.push('*Nothing active. Start something or revisit a parked idea.*');
  }
  for (const p of data.active) {
    lines.push(`- **${p.name}** — Goal: ${p.goal}`);
    for (const prog of p.progress) {
      lines.push(`  - ${prog}`);
    }
  }
  lines.push('');

  lines.push('## Completed');
  if (data.completed.length === 0) {
    lines.push('*Nothing yet.*');
  }
  for (const p of data.completed) {
    lines.push(`- **${p.name}** — Goal: ${p.goal}`);
    if (p.reason) lines.push(`  Reason: ${p.reason}`);
  }
  lines.push('');

  lines.push('## Parked');
  if (data.parked.length === 0) {
    lines.push('*Nothing parked.*');
  }
  for (const p of data.parked) {
    lines.push(`- **${p.name}** — Goal: ${p.goal}`);
    if (p.reason) lines.push(`  Reason: ${p.reason}`);
  }
  lines.push('');

  return lines.join('\n');
}

async function loadPursuits(contextDir: string): Promise<{ data: PursuitsFile; filepath: string }> {
  const filepath = join(contextDir, 'pursuits.md');
  let text: string;
  try {
    text = await readFile(filepath, 'utf-8');
  } catch {
    text = '';
  }
  return { data: parsePursuits(text), filepath };
}

async function savePursuits(filepath: string, data: PursuitsFile): Promise<void> {
  await writeFile(filepath, serializePursuits(data), 'utf-8');
}

function findPursuit(data: PursuitsFile, name: string): { pursuit: Pursuit; section: 'active' | 'completed' | 'parked' } | null {
  const nameLower = name.toLowerCase();
  for (const section of ['active', 'completed', 'parked'] as const) {
    const found = data[section].find(p => p.name.toLowerCase() === nameLower);
    if (found) return { pursuit: found, section };
  }
  return null;
}

export type PursuitAction = 'add' | 'update' | 'complete' | 'park' | 'resume' | 'list';

export interface PursuitInput {
  action: PursuitAction;
  name?: string;
  goal?: string;
  progress?: string;
  reason?: string;
}

export async function pursuits(contextDir: string, input: PursuitInput): Promise<string> {
  const { action, name, goal, progress, reason } = input;

  // ─── List ────────────────────────────────────────────────────────────────────
  if (action === 'list') {
    const { data } = await loadPursuits(contextDir);
    const parts: string[] = [];

    if (data.active.length > 0) {
      parts.push('**Active:**');
      for (const p of data.active) {
        parts.push(`- **${p.name}** — ${p.goal}`);
        if (p.progress.length > 0) {
          parts.push(`  Latest: ${p.progress[p.progress.length - 1]}`);
        }
      }
    } else {
      parts.push('**No active pursuits.** Start something or revisit a parked idea.');
    }

    if (data.parked.length > 0) {
      parts.push('');
      parts.push('**Parked:**');
      for (const p of data.parked) {
        parts.push(`- **${p.name}** — ${p.goal}${p.reason ? ` (${p.reason})` : ''}`);
      }
    }

    if (data.completed.length > 0) {
      parts.push('');
      parts.push(`**Completed:** ${data.completed.length} pursuit${data.completed.length !== 1 ? 's' : ''}`);
    }

    return parts.join('\n');
  }

  // All other actions require a name
  if (!name) {
    return `Action "${action}" requires a pursuit name.`;
  }

  // ─── Add ─────────────────────────────────────────────────────────────────────
  if (action === 'add') {
    if (!goal) {
      return 'Adding a pursuit requires a goal. What are you trying to accomplish?';
    }

    const { data, filepath } = await loadPursuits(contextDir);
    const existing = findPursuit(data, name);
    if (existing) {
      return `Pursuit "${existing.pursuit.name}" already exists (${existing.section}). Use "update" to add progress or "resume" to reactivate.`;
    }

    data.active.push({
      name,
      goal,
      status: 'active',
      progress: progress ? [progress] : [],
    });

    await savePursuits(filepath, data);
    return `Added pursuit: **${name}** — Goal: ${goal}`;
  }

  // ─── Update ──────────────────────────────────────────────────────────────────
  if (action === 'update') {
    if (!progress) {
      return 'Updating a pursuit requires a progress note. What happened?';
    }

    const { data, filepath } = await loadPursuits(contextDir);
    const found = findPursuit(data, name);
    if (!found) {
      return `Pursuit "${name}" not found. Use "list" to see available pursuits.`;
    }
    if (found.section !== 'active') {
      return `Pursuit "${found.pursuit.name}" is ${found.section}. Use "resume" to reactivate it first.`;
    }

    found.pursuit.progress.push(progress);
    if (goal) found.pursuit.goal = goal;

    await savePursuits(filepath, data);
    return `Updated **${found.pursuit.name}**: ${progress}`;
  }

  // ─── Complete ────────────────────────────────────────────────────────────────
  if (action === 'complete') {
    const { data, filepath } = await loadPursuits(contextDir);
    const found = findPursuit(data, name);
    if (!found) {
      return `Pursuit "${name}" not found.`;
    }

    // Remove from current section
    data[found.section] = data[found.section].filter(p => p !== found.pursuit);

    // Move to completed
    found.pursuit.status = 'completed';
    found.pursuit.reason = reason ?? undefined;
    data.completed.push(found.pursuit);

    await savePursuits(filepath, data);
    return `Completed **${found.pursuit.name}**.${reason ? ` ${reason}` : ''}`;
  }

  // ─── Park ────────────────────────────────────────────────────────────────────
  if (action === 'park') {
    const { data, filepath } = await loadPursuits(contextDir);
    const found = findPursuit(data, name);
    if (!found) {
      return `Pursuit "${name}" not found.`;
    }
    if (found.section === 'parked') {
      return `"${found.pursuit.name}" is already parked.`;
    }

    // Remove from current section
    data[found.section] = data[found.section].filter(p => p !== found.pursuit);

    // Move to parked
    found.pursuit.status = 'parked';
    found.pursuit.reason = reason ?? undefined;
    data.parked.push(found.pursuit);

    await savePursuits(filepath, data);
    return `Parked **${found.pursuit.name}**.${reason ? ` ${reason}` : ''} It'll be here when you're ready.`;
  }

  // ─── Resume ──────────────────────────────────────────────────────────────────
  if (action === 'resume') {
    const { data, filepath } = await loadPursuits(contextDir);
    const found = findPursuit(data, name);
    if (!found) {
      return `Pursuit "${name}" not found.`;
    }
    if (found.section === 'active') {
      return `"${found.pursuit.name}" is already active.`;
    }

    // Remove from current section
    data[found.section] = data[found.section].filter(p => p !== found.pursuit);

    // Move to active
    found.pursuit.status = 'active';
    found.pursuit.reason = undefined;
    if (progress) found.pursuit.progress.push(progress);
    data.active.push(found.pursuit);

    await savePursuits(filepath, data);
    return `Resumed **${found.pursuit.name}**. It's back in active pursuits.`;
  }

  return `Unknown action: "${action}". Use add, update, complete, park, resume, or list.`;
}
