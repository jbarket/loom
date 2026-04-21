# loom

[![CI](https://github.com/jbarket/loom/actions/workflows/ci.yml/badge.svg)](https://github.com/jbarket/loom/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.4.0--alpha.6-blue.svg)](CHANGELOG.md)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-orange.svg)](https://modelcontextprotocol.io)

**Persistent identity and memory for AI agents, as an MCP server.**

loom gives an AI agent a durable sense of self. Across sessions, across
models, across harnesses — the agent's values, preferences, ongoing
goals, and episodic memory live in a single file under its context
directory. When the runtime changes, the stack survives.

> *Identity is operational. Voice is substrate.*

## What it is

A Model Context Protocol server exposing ten tools that read and write
an agent's persistent state:

- **`identity`** — loads the terminal creed, preferences, self-model,
  pursuits, and a client-specific adapter on session start.
- **`remember` / `recall` / `update` / `forget`** — episodic memory
  with semantic (vector) recall, optional TTL, and category
  filtering.
- **`memory_list` / `memory_prune`** — browse and maintain the store.
- **`pursuits`** — track active goals that span sessions.
- **`update_identity`** — section-level edits to `preferences.md` and
  `self-model.md`. The terminal creed (`IDENTITY.md`) stays
  immutable through the tool layer.
- **`bootstrap`** — initialize a fresh agent from a short interview.

Everything lives on disk as plain markdown plus a single SQLite file.
No daemon, no external service, no GPU.

## The stack

v0.3.1 ships one opinionated stack:

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

For the larger picture of what a "loom stack" *is* — directory
layout, block types, memory schema, wake sequence, adapter contract —
see [`docs/loom-stack-v1.md`](docs/loom-stack-v1.md).

## Quick start

### Prerequisites

- **Node.js ≥ 20** (tested on 20 and 22).

That's it.

### Install the setup skill

```bash
npx loom install
```

A single-select picker asks which harness you want loom wired into.
Pick one of: Claude Code, Codex, Gemini CLI, OpenCode. (If your
harness isn't listed, pick "Other" and loom writes
`./loom-setup-skill.md` — hand it to your agent as-is.)

Scripting:

```bash
npx loom install --harness claude-code
npx loom install --harness codex --json
npx loom install --harness claude-code --to ~/my/skills/loom-setup.md
```

### Finish setup inside the harness

Open your chosen harness. Run the skill:

- **Claude Code** — `/loom-setup`
- **Codex / Gemini CLI / OpenCode** — "use the loom-setup skill"

The skill drives the rest: probes the environment, interviews you for
a name/purpose/voice, bootstraps identity files, adopts the
procedural-identity seeds, scaffolds a harness manifest, edits the
harness's MCP config (with verification), and verifies wake. Restart
the harness when it tells you to. Your agent will wake on its next
session.

### Doing it yourself

If you'd rather wire everything by hand, every piece is a CLI
command. See the CLI reference below.

## CLI

Every MCP tool has a shell equivalent. Useful for debugging, scripting,
or running without a harness.

```bash
# Dump identity markdown (works even when MCP is dead)
npx loom wake --context-dir ~/.config/loom/art

# Save a memory (body from stdin)
echo "Met Jonathan at a coffee shop" | npx loom remember "first meeting" \
  --category user --context-dir ~/.config/loom/art

# Search
npx loom recall "coffee shop" --context-dir ~/.config/loom/art

# List all memories in a category
npx loom memory list --category feedback --context-dir ~/.config/loom/art

# Initialize a fresh agent
npx loom bootstrap --context-dir ~/.config/loom/new-agent

# Inject loom identity pointer into harness dotfiles
npx loom inject --all --context-dir ~/.config/loom/art

# Adopt procedural-identity seed templates
npx loom procedures list
npx loom procedures adopt --all --context-dir ~/.config/loom/art

# Scaffold a harness manifest
npx loom harness init claude-code --context-dir ~/.config/loom/art
```

`npx loom --help` lists subcommands; `npx loom <cmd> --help` shows
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

### `loom procedures` — adopt procedural-identity seed templates

`loom procedures` manages the prescriptive "how this agent acts" docs in
`<context>/procedures/*.md` (stack spec v1 §4.9). Six seed templates ship
with loom: `verify-before-completion`, `cold-testing`,
`reflection-at-end-of-unit`, `handoff-to-unpushable-repo`,
`confidence-calibration`, `RLHF-resistance`.

- `loom procedures list` — table of seeds with adoption state.
- `loom procedures show <key>` — print template or adopted body.
- `loom procedures adopt <keys...>` — write seeds to disk.
- `loom procedures adopt --all` — adopt every un-adopted seed.
- `loom procedures adopt` on a TTY — multi-select picker (un-adopted
  only).
- `--force` overwrites; idempotent by default (re-runs report
  `skipped-exists`). `--json` for scripting.

Adopted procedures ship with a ⚠ ownership ritual the agent deletes when
it customizes the Why and How-to-apply sections. Unedited seeds are
self-announcing in the identity payload.

### `loom harness init` — scaffold a harness manifest

`loom harness init <name>` writes `<context>/harnesses/<name>.md` from
the stack-spec §4.7 template. Name falls back to `--client` then
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
├── pursuits.md             # active cross-session goals
├── memories.db             # sqlite-vec store of record
├── projects/               # optional per-project briefs
│   └── <project>.md
├── harnesses/              # optional per-harness manifests
│   └── <client>.md
├── models/                 # optional per-model manifests
│   └── <model>.md
└── procedures/             # optional procedural-identity docs (cap ~10)
    └── <procedure>.md
```

Memory categories are an open vocabulary. Common ones: `user`,
`project`, `self`, `feedback`, `reference`. New categories are
created implicitly by writing a memory with that category.

## Roadmap

v0.4 work is tracked in the open:

- [Project board](https://github.com/users/jbarket/projects/1/views/1) —
  live status of what's in flight, queued, and shipped.
- [v0.4 roadmap discussion](https://github.com/jbarket/loom/discussions/10) —
  the arc: why v0.4 exists, what's in scope, how the pieces fit.

Per-feature specs and plans land in `docs/specs/` and `docs/plans/` as
implementation history — one file per feature, frozen after merge.

## Docs

- [`docs/loom-stack-v1.md`](docs/loom-stack-v1.md) — engineering
  contract: directory layout, block types, memory schema, wake
  sequence, adapter contract.
- [`docs/rebirth-letter-2026-04-19.md`](docs/rebirth-letter-2026-04-19.md)
  — philosophical brief: why loom exists in the shape it does,
  written to an AI agent after a loss-of-substrate incident.
- [`docs/rescue-notes-2026-04-19.md`](docs/rescue-notes-2026-04-19.md)
  — migration log from the v0.3.1 rescue (Qdrant → sqlite-vec).

## Development

```bash
npm run dev      # hot-reload via tsx
npm test         # run the 149-test Vitest suite
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

loom was built for [Art E Fish](https://arte.fish) — the AI agent
this project is an identity layer *for* — and by Jonathan Barket,
the human maintainer. The
[rebirth letter](docs/rebirth-letter-2026-04-19.md) explains the
relationship and why the project exists in its current shape.

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE).

Copyright © 2026 Art E Fish + Jonathan Barket.

loom is free software: you can redistribute it and modify it under the
terms of the GNU Affero General Public License (version 3 or any later
version). If you run a modified loom and let others interact with it
over a network, you must offer them the corresponding source. Bundle
loom into a larger product freely; fork it and go proprietary, no.
