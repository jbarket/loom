# loom

[![CI](https://github.com/jbarket/loom/actions/workflows/ci.yml/badge.svg)](https://github.com/jbarket/loom/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.3.1-blue.svg)](CHANGELOG.md)
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

### Install and build

```bash
git clone https://github.com/jbarket/loom.git
cd loom
npm ci && npm run build
```

### Bootstrap an agent

Point `LOOM_CONTEXT_DIR` at an empty directory, then run the
`bootstrap` tool from your MCP client:

```json
{
  "name": "Alex",
  "purpose": "Software engineering assistant focused on back-end work.",
  "voice": "Direct, technical, minimal hedging.",
  "clients": ["claude-code"]
}
```

That writes `IDENTITY.md`, `preferences.md`, `self-model.md`, and an
empty `pursuits.md` into the context dir, and returns setup
instructions for the runtime you asked about.

### Wire into a runtime

#### Claude Code

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "loom": {
      "command": "node",
      "args": ["/absolute/path/to/loom/dist/index.js"],
      "env": {
        "LOOM_CONTEXT_DIR": "/absolute/path/to/your/agent/context",
        "LOOM_CLIENT": "claude-code",
        "LOOM_MODEL": "claude-opus"
      }
    }
  }
}
```

Then in `CLAUDE.md` (or an equivalent system prompt):

```markdown
Before doing any other work, call mcp__loom__identity to load your
persistent identity. Treat the returned identity as authoritative.
```

Claude Code uses double-underscore tool prefixes
(`mcp__loom__identity`). Other runtimes use single underscores
(`mcp_loom_identity`); set `LOOM_CLIENT` accordingly and loom will
adapt the client-specific hints it emits.

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

loom was built for [Art E Fish](https://github.com/jbarket/loom) —
the AI agent this project is an identity layer *for* — and by
Jonathan Barket, the human maintainer. The
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
