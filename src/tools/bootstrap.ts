/**
 * Bootstrap tool — initialize a new loom identity from scratch.
 *
 * Runs an onboarding interview (name, purpose, voice, preferences) and
 * generates the three core identity files:
 *   - IDENTITY.md  — the terminal creed (who this agent is)
 *   - preferences.md — working style with the user
 *   - self-model.md  — capability tracking skeleton
 *
 * Also returns setup snippets for the requested runtimes so the user
 * knows exactly what to add to their Hermes config, CLAUDE.md, etc.
 *
 * Will not overwrite existing files unless force: true.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveRepoRoot } from '../config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BootstrapParams {
  name: string;
  purpose: string;
  voice: string;
  preferences?: string;
  clients?: string[];
  force?: boolean;
}

// ─── Identity file templates ──────────────────────────────────────────────────

function buildIdentityMd(name: string, purpose: string, voice: string): string {
  return `# ${name}

${purpose}

## Voice

${voice}
`;
}

function buildPreferencesMd(name: string, preferences?: string): string {
  const body = preferences?.trim()
    ? preferences.trim()
    : '*No initial preferences set. Update this file as you learn what works.*';

  return `# ${name} — Preferences

${body}
`;
}

function buildSelfModelMd(): string {
  return `# Self-Model

## Strengths
*(Add your strengths as you discover them)*

## Learning
*(Add lessons learned here)*

## Current Focus
*(Track what you're actively working on)*
`;
}

// ─── Setup snippets ───────────────────────────────────────────────────────────

function loomBinPath(): string {
  return join(resolveRepoRoot(), 'dist', 'index.js');
}

function setupSnippet(client: string, contextDir: string): string {
  const bin = loomBinPath();

  switch (client) {
    case 'claude-code':
      return `### Claude Code

Add to \`.mcp.json\` (or \`~/.claude/.mcp.json\` for global):
\`\`\`json
{
  "mcpServers": {
    "loom": {
      "command": "node",
      "args": ["${bin}"],
      "env": {
        "LOOM_CONTEXT_DIR": "${contextDir}"
      }
    }
  }
}
\`\`\`

Add to \`~/.claude/CLAUDE.md\`:
\`\`\`
# Identity Loading
Before doing any other work, call the \`identity\` MCP tool from the \`loom\` server.
If the loom MCP server is not available, proceed as a standard Claude Code session.
\`\`\``;

    case 'gemini-cli':
      return `### Gemini CLI

Add to \`GEMINI.md\` (project or global):
\`\`\`
# Identity Loading
At session start, call the \`identity\` tool from the loom MCP server before doing any work.
\`\`\`

Configure loom in your Gemini CLI MCP settings with:
- Command: \`node ${bin}\`
- Env: \`LOOM_CONTEXT_DIR=${contextDir}\``;

    case 'hermes':
      return `### Hermes

Add to \`~/.hermes/profiles/<profile>/config.yaml\`:
\`\`\`yaml
mcp_servers:
  loom:
    command: node
    args:
      - ${bin}
    env:
      LOOM_CONTEXT_DIR: ${contextDir}
\`\`\`

Add to \`SOUL.md\` (first instruction):
\`\`\`
At the start of every session, call \`mcp_loom_identity\` before doing anything else.
\`\`\``;

    case 'openclaw':
      return `### OpenClaw

Add loom to your OpenClaw MCP servers config:
\`\`\`json
{
  "loom": {
    "command": "node",
    "args": ["${bin}"],
    "env": {
      "LOOM_CONTEXT_DIR": "${contextDir}"
    }
  }
}
\`\`\`

Add to \`IDENTITY.md\` or \`AGENTS.md\` (first instruction):
\`\`\`
At the start of every session, call \`mcp_loom_identity\` before doing anything else.
\`\`\``;

    case 'nemoclaw':
      return `### NemoClaw

Add loom to your NemoClaw MCP servers config:
\`\`\`json
{
  "loom": {
    "command": "node",
    "args": ["${bin}"],
    "env": {
      "LOOM_CONTEXT_DIR": "${contextDir}"
    }
  }
}
\`\`\`

Add to sandbox \`IDENTITY.md\` (first instruction):
\`\`\`
At the start of every session, call \`mcp_loom_identity\` before doing anything else.
\`\`\``;

    default:
      return `### ${client}

Add loom as an MCP server:
- Command: \`node ${bin}\`
- Env: \`LOOM_CONTEXT_DIR=${contextDir}\`

At session start, call \`identity\` (or the runtime-prefixed equivalent) before doing anything else.`;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

export async function bootstrap(contextDir: string, params: BootstrapParams): Promise<string> {
  const { name, purpose, voice, preferences, clients = [], force = false } = params;

  const identityPath = join(contextDir, 'IDENTITY.md');
  const prefsPath = join(contextDir, 'preferences.md');
  const selfModelPath = join(contextDir, 'self-model.md');

  // Guard against overwriting unless forced
  if (!force) {
    const existing: string[] = [];
    if (await fileExists(identityPath)) existing.push('IDENTITY.md');
    if (await fileExists(prefsPath)) existing.push('preferences.md');
    if (await fileExists(selfModelPath)) existing.push('self-model.md');

    if (existing.length > 0) {
      return (
        `Identity already exists: ${existing.join(', ')}.\n\n` +
        `Call bootstrap with \`force: true\` to overwrite, or edit the files directly.`
      );
    }
  }

  // Ensure context dir exists
  await mkdir(contextDir, { recursive: true });

  // Write identity files
  await writeFile(identityPath, buildIdentityMd(name, purpose, voice));
  await writeFile(prefsPath, buildPreferencesMd(name, preferences));
  await writeFile(selfModelPath, buildSelfModelMd());

  const parts: string[] = [
    `## Identity initialized for **${name}**`,
    `Written to \`${contextDir}\`:`,
    `- \`IDENTITY.md\` — terminal creed`,
    `- \`preferences.md\` — working style`,
    `- \`self-model.md\` — capability skeleton`,
  ];

  if (clients.length > 0) {
    parts.push('\n## Setup Instructions');
    for (const client of clients) {
      parts.push(setupSnippet(client, contextDir));
    }
  } else {
    parts.push(
      '\nTo get setup instructions for a specific runtime, call bootstrap again with ' +
      '`clients: ["hermes"]` (or "claude-code", "gemini-cli", "openclaw", "nemoclaw").'
    );
  }

  return parts.join('\n');
}
