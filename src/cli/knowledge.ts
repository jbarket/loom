/**
 * loom knowledge — write / recall / maintain the knowledge store.
 */
import { parseArgs } from 'node:util';
import { knowledgeWrite, titleToSlug, deriveSourced } from '../tools/knowledge-write.js';
import { knowledgeRecall } from '../tools/knowledge-recall.js';
import { knowledgeMaintain } from '../tools/knowledge-maintain.js';
import { createKnowledgeBackend } from '../backends/index.js';
import { extractGlobalFlags, resolveEnv } from './args.js';
import { readBody, renderJson } from './io.js';
import type { IOStreams } from './io.js';

const USAGE = `Usage: loom knowledge <subcommand> [options]

Subcommands:
  write    Upsert a knowledge entity page (body via --body or stdin)
  recall   Search the knowledge store (LIKE over title/body/domain)
  maintain Read-only maintenance report (expansion, cold pages, misfile audit)

Options (write):
  --slug <slug>          Entity slug (derived from --title if omitted)
  --title <title>        Entity title (required)
  --domain <domain>      Domain tag, e.g. "music/eurorack" (required)
  --body <text>          Page body markdown (required; use stdin for long content)
  --sourcing <value>     'sourced' or 'provisional' (default: sourced; overridden by gate)
  --provenance <text>    Page-level origin note (for imported/migrated content)
  --json                 Emit KnowledgeWriteResult

Options (recall):
  <query>                Search query (positional; optional — returns all if omitted)
  --domain <prefix>      Filter by domain prefix
  --limit <n>            Max results (default: 10)
  --json                 Emit KnowledgePage[]

Options (maintain):
  --thin-body <n>        Body length threshold for expansion candidates (default: 1000)
  --min-hits <n>         Min hit_count for expansion candidates (default: 3)
  --cold-days <n>        Days without access before cold (default: 30)
  --json                 Emit KnowledgeMaintainReport

Global: --context-dir, --help/-h
`;

const SUBCOMMANDS = new Set(['write', 'recall', 'maintain']);

export async function run(argv: string[], io: IOStreams): Promise<number> {
  const { flags: global, rest } = extractGlobalFlags(argv);
  const sub = rest[0];
  const subRest = rest.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    io.stdout(USAGE);
    return sub ? 0 : 2;
  }
  if (!SUBCOMMANDS.has(sub)) {
    io.stderr(`Unknown knowledge subcommand: ${sub}\n${USAGE}`);
    return 2;
  }

  const env = resolveEnv(global, io.env);

  if (sub === 'write') {
    let parsed;
    try {
      parsed = parseArgs({
        args: subRest,
        options: {
          slug:       { type: 'string' },
          title:      { type: 'string' },
          domain:     { type: 'string' },
          body:       { type: 'string' },
          sourcing:   { type: 'string' },
          provenance: { type: 'string' },
        },
        strict: true,
        allowPositionals: false,
      });
    } catch (err) {
      io.stderr(`${(err as Error).message}\n${USAGE}`);
      return 2;
    }

    const title = parsed.values.title;
    const domain = parsed.values.domain;
    const body = parsed.values.body ?? await readBody(io, 'knowledge-write');

    if (!title) { io.stderr('--title is required.\n'); return 2; }
    if (!domain) { io.stderr('--domain is required.\n'); return 2; }
    if (!body) { io.stderr('--body is required (or pipe body via stdin).\n'); return 2; }

    const sourcing = parsed.values.sourcing;
    if (sourcing && sourcing !== 'sourced' && sourcing !== 'provisional') {
      io.stderr(`--sourcing must be 'sourced' or 'provisional'.\n`);
      return 2;
    }

    const writeInput = {
      slug: parsed.values.slug,
      title,
      domain,
      body,
      sourcing: (sourcing as 'sourced' | 'provisional' | undefined),
      provenance: parsed.values.provenance,
    };

    if (env.json) {
      const backend = createKnowledgeBackend(env.contextDir);
      try {
        const result = await backend.writePage({
          ...writeInput,
          slug: writeInput.slug ?? titleToSlug(title),
          sourcing: deriveSourced(writeInput),
        });
        renderJson(io, result);
        return 0;
      } finally {
        backend.close();
      }
    }

    try {
      const text = await knowledgeWrite(env.contextDir, writeInput);
      io.stdout(text.endsWith('\n') ? text : text + '\n');
      return 0;
    } catch (err) {
      io.stderr(`${(err as Error).message}\n`);
      return 1;
    }
  }

  if (sub === 'recall') {
    let parsed;
    try {
      parsed = parseArgs({
        args: subRest,
        options: {
          domain: { type: 'string' },
          limit:  { type: 'string' },
        },
        strict: true,
        allowPositionals: true,
      });
    } catch (err) {
      io.stderr(`${(err as Error).message}\n${USAGE}`);
      return 2;
    }

    const query = parsed.positionals[0];
    const limit = parsed.values.limit !== undefined
      ? Number.parseInt(parsed.values.limit, 10)
      : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      io.stderr(`--limit must be a positive integer.\n`);
      return 2;
    }

    if (env.json) {
      const backend = createKnowledgeBackend(env.contextDir);
      try {
        const pages = await backend.queryPages({
          query,
          domain: parsed.values.domain,
          excludeStatus: 'archived',
          limit,
        });
        renderJson(io, pages);
        return 0;
      } finally {
        backend.close();
      }
    }

    try {
      const text = await knowledgeRecall(env.contextDir, {
        query,
        domain: parsed.values.domain,
        limit,
      });
      io.stdout(text.endsWith('\n') ? text : text + '\n');
      return 0;
    } catch (err) {
      io.stderr(`${(err as Error).message}\n`);
      return 1;
    }
  }

  // maintain
  let parsed;
  try {
    parsed = parseArgs({
      args: subRest,
      options: {
        'thin-body': { type: 'string' },
        'min-hits':  { type: 'string' },
        'cold-days': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    io.stderr(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }

  const thinBodyThreshold = parsed.values['thin-body'] !== undefined
    ? Number.parseInt(parsed.values['thin-body'], 10)
    : undefined;
  const expansionMinHits = parsed.values['min-hits'] !== undefined
    ? Number.parseInt(parsed.values['min-hits'], 10)
    : undefined;
  const coldDays = parsed.values['cold-days'] !== undefined
    ? Number.parseInt(parsed.values['cold-days'], 10)
    : undefined;

  const opts = { thinBodyThreshold, expansionMinHits, coldDays };

  if (env.json) {
    const backend = createKnowledgeBackend(env.contextDir);
    try {
      renderJson(io, await backend.maintain(opts));
      return 0;
    } finally {
      backend.close();
    }
  }

  try {
    const text = await knowledgeMaintain(env.contextDir, opts);
    io.stdout(text.endsWith('\n') ? text : text + '\n');
    return 0;
  } catch (err) {
    io.stderr(`${(err as Error).message}\n`);
    return 1;
  }
}

