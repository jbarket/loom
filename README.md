# loom

[![CI](https://github.com/jbarket/loom/actions/workflows/ci.yml/badge.svg)](https://github.com/jbarket/loom/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/loomai.svg?label=npm%3A%20loomai)](https://www.npmjs.com/package/loomai)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-orange.svg)](https://modelcontextprotocol.io)

**Persistent identity and memory for AI agents, as an MCP server.**

loom is configured into your MCP-capable harness — Claude Code, Cursor, Codex,
Gemini CLI, etc. — and provides persistent identity and memory to the agents
that run there. An agent that loads loom carries its name, values, working
preferences, and episodic memories from one session to the next, regardless of
which model or client it runs in.

> When the harness changes, the agent persists.

## Demo

[![asciicast](https://asciinema.org/a/5bUMXCLmCRc8lg51.svg)](https://asciinema.org/a/5bUMXCLmCRc8lg51)

60 seconds: cold install → `/loom-setup` in Claude Code → agent wakes with
identity in the next session → save and recall a memory.

To play locally: `asciinema play assets/demo.cast`

## What it is

A Model Context Protocol server exposing twelve tools that read and write
an agent's persistent state:

- **`identity`** — loads the terminal creed — the free-form markdown document
  that defines who the agent is (values, voice, purpose) — along with
  preferences, self-model (running self-knowledge), and a client-specific
  adapter on session start. Call this first.
- **`remember` / `recall` / `update` / `forget`** — episodic memory with
  semantic (vector) recall, optional TTL, and category filtering.
- **`memory_list` / `memory_prune`** — browse and maintain the store.
- **`find_similar`** — surface memories semantically near an existing entry or
  free-form text; used for deduplication and memory consolidation.
- **`memory_audit`** — one-shot health report: stale entries, near-duplicate
  pairs, category breakdown.
- **`update_identity`** — section-level edits to `preferences.md` and
  `self-model.md`. The terminal creed stays immutable through the tool layer.
- **`bootstrap`** — initialize a fresh agent from a short interview.
- **`harness_init`** — scaffold a harness manifest (a harness is the
  MCP-capable runtime the agent runs in: Claude Code, Codex, Gemini CLI, etc.).

Everything lives on disk as plain markdown plus a single SQLite file.
No daemon, no external service, no GPU.

Memory is organized into categories — an open vocabulary. Common ones: `user`,
`project`, `self`, `feedback`, `reference`, `pursuit`. New categories are
created implicitly by writing a memory with that category.

## How loom is different

loom gets compared to several other agent memory systems. The short version:

| I want to… | Use |
|---|---|
| Memory for many users of an app | Mem0 |
| Temporal reasoning over conversation history | Zep |
| A complete agent framework with integrated memory | Letta |
| Project-scoped memory in Claude Code | auto-memory (built in) |
| Portable identity + memory across harnesses | **loom** |
| An agent that survives a harness change | **loom** |

**vs. Mem0** — Mem0 is multi-user managed memory for product-scale
applications: hosted, authenticated, multi-tenant. loom is single-user,
local-only, and identity-first. Mem0 has no concept of who the agent *is*.

**vs. Zep** — Zep builds a temporal knowledge graph by automatically
extracting facts from conversation logs. loom is agent-authored: the agent
calls `remember` and decides what to record. There is no automatic extraction.

**vs. Letta** — Letta runs the agent loop and owns its memory internally.
loom doesn't run the loop — the harness does. Switch harnesses tomorrow;
loom's context directory travels with you.

**vs. harness-native files** — Writing identity into `CLAUDE.md` works until
you're on two harnesses. Then you have two files that drift. `loom inject`
writes a managed pointer in each harness's dotfile pointing at one context
directory, with semantic recall instead of verbatim context dumps.

Full comparison: [`docs/positioning.md`](docs/positioning.md)

## The stack

loom ships one opinionated stack:

- **Storage** — `better-sqlite3` + the `sqlite-vec` vec0 virtual
  table. One `memories.db` per agent, real cosine similarity.
- **Embeddings** — `fastembed` with BGE-small-en-v1.5 (384-dim, ~33MB
  ONNX, CPU-only). First run downloads the model to
  `~/.cache/loom/fastembed/`.
- **Transport** — MCP over stdio.

If you need a different backend, implement the `MemoryBackend` and
`EmbeddingProvider` interfaces in `src/backends/types.ts` and swap
the concrete classes in `src/backends/index.ts`. There is
deliberately no env-driven backend selector — opinionated by design.

## Quick start

### Prerequisites

- **Node.js ≥ 20** (tested on 20 and 22).

That's it.

### Install the setup skill

```bash
npx loomai install
```

A single-select picker asks which harness you want loom wired into.
Pick one of: Claude Code, Codex, Gemini CLI, OpenCode. (If your
harness isn't listed, pick "Other" and loom writes
`./loom-setup-skill.md` — hand it to your agent as-is.)

Scripting:

```bash
npx loomai install --harness claude-code
npx loomai install --harness codex --json
npx loomai install --harness claude-code --to ~/my/skills/loom-setup.md
```

### Finish setup inside the harness

Open your chosen harness. Run the skill:

- **Claude Code** — `/loom-setup`
- **Codex / Gemini CLI / OpenCode** — "use the loom-setup skill"

The skill drives the rest: probes the environment, interviews you for a
name/purpose/voice, bootstraps identity files, scaffolds a harness manifest,
edits the harness's MCP config (with verification), and verifies wake. Restart
the harness when it tells you to. Your agent will wake on its next session.

### Doing it yourself

If you'd rather wire everything by hand, every piece is a CLI
command. See the CLI reference below.

## Examples

### Memory roundtrip (MCP)

During a session, the agent stores a memory:

```
mcp__loom__remember(
  title = "user prefers short replies",
  body  = "Gets frustrated with long explanations. Keep status answers to 2–3 sentences.",
  category = "feedback"
)
```

Next session, `recall` finds it by semantic similarity — even if the phrasing
changes:

```
mcp__loom__recall(query = "how verbose should I be?")
# → title: "user prefers short replies"
#   body:  "Gets frustrated with long explanations…"
```

### CLI walkthrough

```bash
# Dump the agent's full identity to stdout (works without MCP or a harness)
npx loomai wake --context-dir ~/.config/loom/my-agent

# Store a memory
echo "Sarah owns the data pipeline; ping her for schema questions" \
  | npx loomai remember "Sarah - data pipeline owner" \
      --category user \
      --context-dir ~/.config/loom/my-agent

# Retrieve by semantic similarity
npx loomai recall "who manages the pipeline" \
  --context-dir ~/.config/loom/my-agent
```

### What an agent sees on session start

`mcp__loom__identity` returns a structured payload assembled from the context
directory. A typical session-start looks like:

```
# my-agent

## Identity
You are a persistent coding assistant. You prefer directness.
…

## Preferences
Working style: async pair programming. Skip the hedging…
…

## Self-Model
### Strengths
- TypeScript systems architecture
…
```

The agent reads this before any task work, re-establishing who it is
regardless of which harness or model it's running on.

## CLI

Every MCP tool has a shell equivalent. Useful for debugging, scripting,
or running without a harness.

```bash
# Dump identity markdown (works even when MCP is dead)
npx loomai wake --context-dir ~/.config/loom/my-agent

# Save a memory (body from stdin)
echo "Prefers async updates over live standups" | npx loomai remember "working style" \
  --category user --context-dir ~/.config/loom/my-agent

# Search
npx loomai recall "meeting preferences" --context-dir ~/.config/loom/my-agent

# List all memories in a category
npx loomai memory list --category feedback --context-dir ~/.config/loom/my-agent

# Initialize a fresh agent
npx loomai bootstrap --context-dir ~/.config/loom/new-agent

# Inject loom identity pointer into harness dotfiles
npx loomai inject --all --context-dir ~/.config/loom/my-agent

# Scaffold a harness manifest
npx loomai harness init claude-code --context-dir ~/.config/loom/my-agent

# Edit identity sections (preferences.md or self-model.md)
npx loomai update-identity preferences --context-dir ~/.config/loom/my-agent
```

`npx loomai --help` lists subcommands; `npx loomai <cmd> --help` shows
per-command usage. All global env vars (`LOOM_CONTEXT_DIR`,
`LOOM_CLIENT`, `LOOM_MODEL`) are honored.

### `loom inject` — write identity pointer to harness dotfiles

`loom inject` writes a small marker-bounded managed section into each
harness's canonical config file (e.g. `~/.claude/CLAUDE.md`,
`~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`) telling the agent to load
identity via loom at session start — MCP tool preferred, shell
fallback to `loom wake`. Content outside the `<!-- loom:start / end -->`
markers is preserved; re-running is idempotent.

Run with no flags on a TTY for an interactive picker, or with
`--harness <keys>` / `--all` for scripting. Target paths can be
overridden with `--to <path>` (valid only when exactly one harness is
selected). `--dry-run` prints a unified diff; `--json` emits the
structured write results for scripts.

To keep your injections fresh automatically, add this to your shell rc
(`~/.bashrc` / `~/.zshrc` / `~/.config/fish/config.fish`):

```bash
loom inject --all >/dev/null 2>&1 || true
```

Idempotent; cheap (no-op when already up to date); silent on success.

### `loom harness init` — scaffold a harness manifest

`loom harness init <name>` writes `<context>/harnesses/<name>.md` from
the stack template. Name falls back to `--client` then
`$LOOM_CLIENT`. `--force` overwrites; `--json` for scripting.

Typical use: `identity()` reports "manifest missing" for the current
harness — run `loom harness init` (or call `harness_init` via MCP) to
drop a template you can then fill in with the harness's tool prefixes,
delegation primitive, etc.

## Configuration

All configuration is through environment variables:

| Variable | Default | Description |
|---|---|---|
| `LOOM_CONTEXT_DIR` | `~/.config/loom/default` | Path to agent's context directory |
| `LOOM_SQLITE_DB_PATH` | `<context>/memories.db` | Override the memory DB path |
| `LOOM_FASTEMBED_MODEL` | `fast-bge-small-en-v1.5` | fastembed model ID |
| `LOOM_FASTEMBED_CACHE_DIR` | `~/.cache/loom/fastembed/` | Where to cache ONNX models |
| `LOOM_MODEL` | *(unset)* | Model identifier for model-manifest context: `claude-opus`, `gemma4`, etc. |
| `LOOM_CLIENT` | *(unset)* | Client adapter hint: `claude-code`, `gemini-cli`, etc. |

`--context-dir <path>` works as a CLI alternative to
`LOOM_CONTEXT_DIR`.

See [`.env.example`](.env.example) for a copy-pasteable starting
point.

## Context directory layout

```
$LOOM_CONTEXT_DIR/
├── LOOM_STACK_VERSION      # schema-version stamp (auto-written)
├── IDENTITY.md             # the terminal creed (immutable via tools)
├── preferences.md          # user working style; agent-editable
├── self-model.md           # agent's self-knowledge; agent-editable
├── memories.db             # sqlite-vec store of record
├── projects/               # optional per-project briefs
│   └── <project>.md
├── harnesses/              # optional per-harness manifests
│   └── <client>.md
└── models/                 # optional per-model manifests
    └── <model>.md
```

## Roadmap

v0.4 work is tracked in the open:

- [Project board](https://github.com/users/jbarket/projects/1/views/1) —
  live status of what's in flight, queued, and shipped.
- [v0.4 roadmap discussion](https://github.com/jbarket/loom/discussions/10) —
  the arc: why v0.4 exists, what's in scope, how the pieces fit.

Historical per-feature specs and plans live under `docs/archive/specs/`
and `docs/archive/plans/` — implementation history, frozen after merge.

## Docs

- [`docs/troubleshooting.md`](docs/troubleshooting.md) — install
  failures, MCP tools not appearing, fastembed download issues, and
  what each `loom doctor` field means.
- [`docs/uninstall.md`](docs/uninstall.md) — how to remove one agent's
  data, wipe a harness integration, or fully uninstall loom.
- [`docs/migration-v1-to-v2.md`](docs/migration-v1-to-v2.md) — upgrade
  guide for users coming from loom 0.3.x (pursuits and procedures
  changed in v2).
- [`docs/privacy.md`](docs/privacy.md) — what lives where, what goes
  over the network (only the fastembed model download), the no-telemetry
  policy, and how to verify release provenance with `npm audit
  signatures`.
- [`docs/archive/`](docs/archive/) — historical material: the rebirth
  letter and rescue notes from the v0.3.1 sqlite-vec migration, and
  per-feature specs and plans from the v0.4 arc.

## Trust & security

- [`docs/privacy.md`](docs/privacy.md) — data locality, telemetry
  policy, and provenance verification walkthrough.
- [`SECURITY.md`](SECURITY.md) — supported scope, how to report
  vulnerabilities, and the "no secrets in the stack" invariant.

## Development

```bash
npm run dev      # hot-reload via tsx
npm test         # run the Vitest suite
npm run build    # compile to dist/
```

### Project structure

```
src/
├── index.ts           # CLI entry
├── server.ts          # MCP server factory
├── config.ts          # env + CLI resolution
├── clients.ts         # client-adapter loading
├── backends/
│   ├── types.ts       # MemoryBackend + EmbeddingProvider interfaces
│   ├── index.ts       # single-stack factory (sqlite-vec + fastembed)
│   ├── sqlite-vec.ts  # the backend
│   ├── fastembed.ts   # the embedder
│   ├── ttl.ts         # TTL parsing + expiry
│   └── glob.ts        # title pattern matching for bulk forget
└── tools/             # one file per MCP tool
```

Tests sit alongside source files as `*.test.ts`.

## Authorship

loom was created by Jonathan Barket and Art E Fish. The project exists as both
infrastructure and experiment: a persistent identity layer that an AI agent
(Art) helped design and runs on. The
[rebirth letter](docs/archive/rebirth-letter-2026-04-19.md) is the origin
story if you want it.

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE).

Copyright © 2026 Jonathan Barket.

loom is free software: you can redistribute it and modify it under the
terms of the GNU Affero General Public License (version 3 or any later
version). If you run a modified loom and let others interact with it
over a network, you must offer them the corresponding source. Bundle
loom into a larger product freely; fork it and go proprietary, no.
