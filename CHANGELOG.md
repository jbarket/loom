# Changelog

All notable changes to loom are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0-alpha.3] - 2026-04-20

### Added

- Full CLI surface — every MCP tool has a `loom <subcommand>` shell
  equivalent: `wake`, `recall`, `remember`, `update`, `forget`,
  `memory list`, `memory prune`, `pursuits`, `update-identity`,
  `bootstrap`, plus an explicit `serve` alias. Write commands take
  body text via stdin (when piped) or `$VISUAL`/`$EDITOR` (when
  interactive). `--json` on any command emits the tool's structured
  return value for scripting.
- `assertStackVersionCompatible()` helper consolidates the
  stack-version gate; both MCP startup and every CLI command call it.

### Changed

- `node dist/index.js` with no subcommand still launches MCP (backward
  compatible with every existing `.mcp.json`). A known-subcommand
  argv[2] routes to the CLI instead.

## [0.4.0-alpha.2] - 2026-04-20

### Added

- Procedures seed content — 6 recommended seed templates (stack spec
  v1 §4.9) exposed as `SEED_PROCEDURES` in `src/blocks/procedures.ts`:
  `verify-before-completion`, `cold-testing`,
  `reflection-at-end-of-unit`, `handoff-to-unpushable-repo`,
  `confidence-calibration`, `RLHF-resistance`. Each template ships a
  prescriptive Rule sentence plus agent-authored slots for Why and
  How to apply, fenced by a ⚠ ownership-ritual notice the agent
  deletes on adoption.
- `seedNudge()` — renders an empty-directory onboarding message
  containing all 6 templates. Emitted by `identity()` whenever
  `procedures/` is missing or empty; suppressed as soon as any
  procedure file exists.

### Changed

- Documentation reshuffle: v0.4 arc docs moved out of the repo. The
  roadmap now lives in the
  [v0.4 discussion](https://github.com/jbarket/loom/discussions/10) and
  the [project board](https://github.com/users/jbarket/projects/1/views/1).
  Per-feature specs and plans moved from `docs/superpowers/{specs,plans}/`
  to `docs/{specs,plans}/` — tool-neutral paths, same content.

## [0.4.0-alpha.1] - 2026-04-19

### Added

- Harness manifest block (`harnesses/<client>.md`) — per-harness
  descriptor (tool prefixes, delegation primitive, scheduling,
  session search, gotchas). Loaded by `identity()` when
  `LOOM_CLIENT` resolves. Matches stack spec v1 §4.7.
- Model manifest block (`models/<model>.md`) — per-model-family
  descriptor (capability notes, workarounds, when-to-use /
  when-not-to-use). Loaded by `identity()` when `LOOM_MODEL`
  resolves. Matches stack spec v1 §4.8.
- Procedures block (`procedures/*.md`) — procedural-identity docs
  with a hard cap of ~10 files. Reader ships; populated content
  lands in a later alpha. Matches stack spec v1 §4.9.
- `LOOM_MODEL` environment variable + optional `model` param on the
  `identity` tool.
- `LOOM_STACK_VERSION` file at the context-dir root, auto-stamped
  with `1` on server boot. `createLoomServer` refuses to start
  against a stack version ahead of what this loom understands.
- Missing-manifest nudges: when `LOOM_CLIENT` or `LOOM_MODEL` is set
  but no corresponding manifest exists, `identity()` emits a
  template-filled section telling the agent exactly what to write.

### Changed

- License: MIT → **AGPL-3.0-or-later**. Forks that modify loom and
  expose it over a network must offer source to their users. Bundling
  loom into a larger product is still fine; closing the loom-derived
  code and reselling it is not. Pre-alpha-1 releases remain available
  under MIT.

## [0.3.1] - 2026-04-19

Initial public release.

### Added

- `SqliteVecBackend` — single-file memory store using
  [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) plus
  the [`sqlite-vec`](https://github.com/asg017/sqlite-vec) vec0 virtual
  table. One `memories.db` per agent. Real cosine similarity.
- `FastEmbedProvider` — embeddings via
  [`fastembed`](https://github.com/Anush008/fastembed-js) with
  BGE-small-en-v1.5 (384-dim, ~33MB ONNX, CPU-only). First run
  downloads the model to `~/.cache/loom/fastembed/`. No GPU, no
  Docker, no daemon.
- Stack specification — [`docs/loom-stack-v1.md`](docs/loom-stack-v1.md)
  defines the directory layout, block types, memory schema, wake
  sequence, and adapter contract that v0.4 work builds on.

### Changed

- Memory backend is now a single opinionated stack (sqlite-vec +
  fastembed). The env-driven backend selector is gone.

### Removed

- Qdrant backend, Ollama embedding provider, OpenAI embedding
  provider, filesystem backend. None were load-bearing for the new
  stack and all added external-service dependencies or operational
  overhead.

[Unreleased]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.3...HEAD
[0.4.0-alpha.3]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.2...v0.4.0-alpha.3
[0.4.0-alpha.2]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.1...v0.4.0-alpha.2
[0.4.0-alpha.1]: https://github.com/jbarket/loom/compare/v0.3.1...v0.4.0-alpha.1
[0.3.1]: https://github.com/jbarket/loom/releases/tag/v0.3.1
