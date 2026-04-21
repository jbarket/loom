/**
 * MCP tool handlers for procedural-identity seed templates.
 *
 * Thin wrappers over src/blocks/procedures.ts. Return prose text that
 * reads well to an LLM caller — server.ts wraps each in the standard
 * { content: [{ type: 'text', text }] } envelope.
 */
import {
  adoptProcedures,
  listProcedures,
  showProcedure,
  SEED_PROCEDURES,
  UnknownProcedureError,
  type AdoptResult,
} from '../blocks/procedures.js';

export async function procedureList(contextDir: string): Promise<string> {
  const { available } = await listProcedures(contextDir);
  const lines = ['Procedures — available seeds (showing which are adopted):\n'];
  const keyWidth = Math.max(3, ...available.map((a) => a.key.length));
  for (const a of available) {
    const marker = a.adopted ? '✓ adopted' : '  not yet';
    lines.push(`  ${a.key.padEnd(keyWidth)}  ${marker}  ${a.path}`);
  }
  lines.push('');
  lines.push('Call `procedure_show { key }` to preview a template, ');
  lines.push('or `procedure_adopt { keys: [...] }` to materialize.');
  return lines.join('\n');
}

export async function procedureShow(contextDir: string, key: string): Promise<string> {
  const detail = await showProcedure(contextDir, key);
  return detail.body ?? detail.template;
}

export async function procedureAdopt(
  contextDir: string,
  input: { keys: string[]; overwrite?: boolean },
): Promise<string> {
  if (!input.keys || input.keys.length === 0) {
    throw new Error('procedure_adopt: keys array required and must be non-empty');
  }
  const results: AdoptResult[] = await adoptProcedures(
    contextDir,
    input.keys,
    { overwrite: input.overwrite },
  );
  const lines = ['Procedure adoption results:\n'];
  for (const r of results) {
    lines.push(`  ${r.key}: ${r.path} (${r.action})`);
  }
  return lines.join('\n');
}

// Re-export for server.ts validation
export { SEED_PROCEDURES, UnknownProcedureError };
