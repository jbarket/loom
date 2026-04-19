# Changelog

All notable changes to loom are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

Work toward v0.4 — see [docs/v0.4-plan.md](docs/v0.4-plan.md) for the
roadmap. The headline features are the stack specification
([docs/loom-stack-v1.md](docs/loom-stack-v1.md)), a CLI adapter for
non-MCP runtimes, filesystem-projection adapter (writes `CLAUDE.md`,
`AGENTS.md`, etc.), an Anthropic `memory_20250818` handler, and
harness + model manifests.

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

[Unreleased]: https://github.com/jbarket/loom/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/jbarket/loom/releases/tag/v0.3.1
