# Changelog

All notable changes to loom are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **`release.yml` switches to npm Trusted Publishing (OIDC).** The
  `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` env is removed from the
  publish step. Auth is handled by the OIDC token exchange between
  GitHub Actions and npm — no long-lived secret required. Requires a
  one-time bootstrap publish and Trusted Publisher configuration on
  npmjs.com (Jonathan-only steps, see SLE-91).

## [0.4.0-alpha.7] - 2026-04-22

### Changed

- **npm package renamed `loom` → `loomai`.** The unscoped `loom`
  name is taken by an unrelated package. Brand (`loom`), CLI binary
  (`loom`), MCP server key (`loom`), and tool prefix
  (`mcp__loom__*`) are unchanged — only the `npx` install surface
  moves: `npx loom install` → `npx loomai install`. alpha.6 was
  never published to npm; alpha.7 is the first release tag.
- `package.json` adds `publishConfig: { access: public, provenance:
  true }` so tagged releases publish with Sigstore provenance.
- README Quick Start + CLI examples updated to `npx loomai`.

### Added

- `.github/workflows/release.yml` — tag-triggered publish pipeline.
  Push a `v*` tag → runs `npm ci`, `npm test`, `npm run build`,
  `npm publish --provenance`, then creates a GitHub release with
  auto-generated notes. Pre-release tags (`-alpha`, `-beta`, `-rc`)
  are flagged as prereleases on GitHub. Publishes via npm Trusted
  Publishing (OIDC) — no `NPM_TOKEN` secret required.

## [0.4.0-alpha.6] - 2026-04-21

### Added

- `loom install` — CLI that writes the bundled `loom-setup` skill
  into a target harness's skills directory. Flag-driven
  (`--harness <key>`) or single-select TUI on a TTY. Targets:
  `claude-code`, `codex`, `gemini-cli`, `opencode`, `other`. `--to`
  overrides destination; `--force` overwrites; `--dry-run` /
  `--json` for scripting. The "other" target writes
  `./loom-setup-skill.md` in the current directory.
- `loom doctor` — read-only CLI probe reporting node version, stack
  version compatibility, context dir resolution, and enumerating
  existing agents under `~/.config/loom/*` with forward-looking
  `git: { initialized, hasRemote, dirty, gitignorePresent }` fields
  per agent. `--json` for scripting.
- `assets/skill/SKILL.md` — bundled skill that drives first-run
  setup inside the target harness: probe → interview → bootstrap →
  procedures adopt → harness init → MCP config edit
  (verify-before-write) → inject → wake verify. Never clobbers
  existing agent dirs; never proposes `--force`.
- `src/install/names.ts` — canonical agent-name validation plus
  reserved-names list (`current`, `default`, `config`, `backups`,
  `cache`, `tmp`, `shared`).
- Stack spec §13 (Multi-agent layout) and §14 (Git-backed agent
  dirs).

### Changed

- `loom bootstrap --name` now validates against the canonical name
  rules. Invalid or reserved names exit with code 2 and a specific
  error.
- `src/cli/tui/multi-select.ts` gains a `single: boolean` option
  (reducer + TTY adapter). Existing multi-select consumers are
  unchanged — the option defaults to `false`.
- `package.json` adds a `files` array so `assets/` ships in the
  published tarball alongside `dist/`.
- README Quick Start rewritten around `npx loom install` +
  `/loom-setup`. Per-command reference sections unchanged.

## [0.4.0-alpha.5] - 2026-04-21

### Added

- `loom procedures list|show|adopt` — CLI for procedural-identity seed
  templates (stack spec v1 §4.9). `adopt` supports positional keys,
  `--all`, `--force` overwrite, and an interactive multi-select picker
  (reuses the `src/cli/tui/multi-select.ts` primitive from alpha.4) on
  TTY. Idempotent by default.
- `loom harness init <name>` — CLI that scaffolds a harness manifest
  (stack spec v1 §4.7) from the template. Falls back to `--client` /
  `$LOOM_CLIENT` when no name is given. `--force` overwrites.
- `mcp__loom__procedure_list`, `procedure_show`, `procedure_adopt`,
  `harness_init` — MCP tools mirroring the CLI. Thin wrappers over the
  same shared core; first-class way for an agent to respond to the
  procedures seed nudge or a missing-manifest warning in the identity
  payload without needing harness-native filesystem tools.
- Stack spec §11 lists Procedures + Manifests as a new adapter.

### Changed

- `src/blocks/procedures.ts` gains `adoptProcedures`, `listProcedures`,
  `showProcedure`, and `UnknownProcedureError` (additive — existing
  exports untouched).
- `src/blocks/harness.ts` gains `initHarness` (additive).

## [0.4.0-alpha.4] - 2026-04-20

### Added

- `loom inject` — CLI command that writes a marker-bounded managed
  section into harness dotfiles (`~/.claude/CLAUDE.md`,
  `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`). The managed section
  tells the agent how to load identity via loom — prefer MCP
  (`mcp__loom__identity`), fall back to the CLI (`loom wake`).
  Content outside the `<!-- loom:start / loom:end -->` markers is
  preserved; re-running is idempotent.
- `--all`, `--harness <keys>`, `--to <path>`, `--dry-run`, `--json`
  flags for non-interactive use. Interactive keyboard-nav wizard
  when stdin is a TTY and no harness flags are given.
- Reusable `src/cli/tui/multi-select.ts` — stdlib keyboard-nav
  checkbox primitive with a pure reducer. Future consumers: bootstrap
  procedure adoption, harness-manifest selection.
- Stack spec §11 lists Injection as a new adapter.

### Changed

- No existing MCP tool surfaces or CLI commands altered. `loom inject`
  is purely additive.

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

[Unreleased]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.7...HEAD
[0.4.0-alpha.7]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.6...v0.4.0-alpha.7
[0.4.0-alpha.6]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.5...v0.4.0-alpha.6
[0.4.0-alpha.5]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.4...v0.4.0-alpha.5
[0.4.0-alpha.4]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.3...v0.4.0-alpha.4
[0.4.0-alpha.3]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.2...v0.4.0-alpha.3
[0.4.0-alpha.2]: https://github.com/jbarket/loom/compare/v0.4.0-alpha.1...v0.4.0-alpha.2
[0.4.0-alpha.1]: https://github.com/jbarket/loom/compare/v0.3.1...v0.4.0-alpha.1
[0.3.1]: https://github.com/jbarket/loom/releases/tag/v0.3.1
