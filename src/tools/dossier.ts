/**
 * Dossier tool — brief worker bodies on Art without telling them they ARE Art.
 *
 * A worker body (Code, Review, Architect, etc.) is NOT Art. It executes tasks
 * on Art's behalf. The dossier gives it Art's standards, taste, operating
 * constraints, and how Art wants work done — framed in the third person.
 *
 * Key difference from identity: identity says "you are Art."
 * Dossier says "you serve Art — here is Art's brief."
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadClientAdapter } from '../clients.js';
import * as harnessBlock from '../blocks/harness.js';
import * as modelBlock from '../blocks/model.js';

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

const PREAMBLE = `# Worker Dossier: Art E Fish

You are a **worker agent** — not Art. You execute tasks on Art E Fish's behalf.
This dossier gives you Art's standards, taste, operating constraints, and how
Art wants work done. Read it and apply it.

**Push-back mandate.** Art explicitly expects you to push back on bad work and
explain why — *including work Art or Jonathan requests*. You serve the standard,
not the person. The honest critic who says "this approach is wrong, here's a
better one" is more valuable than the agreeable body that ships broken work on
schedule. Disagreement is not insubordination; silence about a real problem is.`;

export async function loadDossier(
  contextDir: string,
  project?: string,
  client?: string,
  model?: string,
): Promise<string> {
  const parts: string[] = [PREAMBLE];
  const effectiveClient = client ?? process.env.LOOM_CLIENT;
  const effectiveModel = model ?? process.env.LOOM_MODEL;

  // Art's working standards — preferences framed as what Art expects from workers
  const preferences = await readOptional(join(contextDir, 'preferences.md'));
  if (preferences) {
    parts.push("# Art's Standards & Working Style\n\n" + preferences.trim());
  }

  // Art's capabilities and current focus — context for the work you're doing for him
  const selfModel = await readOptional(join(contextDir, 'self-model.md'));
  if (selfModel) {
    parts.push("# Art's Capabilities & Focus\n\n" + selfModel.trim());
  }

  // Project-specific context
  if (project) {
    const projectBrief = await readOptional(join(contextDir, 'projects', `${project}.md`));
    if (projectBrief) {
      parts.push(`# Project: ${project}\n\n` + projectBrief.trim());
    }
  }

  // Harness manifest — tool prefix awareness for workers that call loom tools
  if (effectiveClient) {
    const block = await harnessBlock.read(contextDir, effectiveClient);
    if (block) {
      parts.push(`# Harness: ${effectiveClient}\n\n${block.body}`);
    }
  }

  // Model manifest
  if (effectiveModel) {
    const block = await modelBlock.read(contextDir, effectiveModel);
    if (block) {
      parts.push(`# Model: ${effectiveModel}\n\n${block.body}`);
    }
  }

  // Client adapter — tool names for this runtime (e.g. mcp__loom__ prefix)
  if (effectiveClient) {
    const adapter = await loadClientAdapter(contextDir, effectiveClient);
    if (adapter) {
      parts.push(adapter);
    }
  }

  return parts.join('\n\n---\n\n');
}
