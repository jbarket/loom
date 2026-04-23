# Upgrading loom

This document covers upgrade notes for each alpha release and describes the automatic
forward migrations loom applies on startup.

## Core guarantee

**If you don't touch anything, `loom wake` still works.**

loom follows this invariant across all alpha releases: the `wake` command (and the
equivalent `identity` MCP tool) always produces a valid identity payload from whatever
is on disk. Missing optional files produce empty sections or stub nudges, never errors.

Exceptions to this guarantee are flagged explicitly in each alpha section below.

## Automatic forward migrations

On every startup, loom applies these forward migrations automatically:

1. **Stack version stamp** — writes `LOOM_STACK_VERSION=1` to the context dir if the
   file is missing. Refuses to boot if the on-disk version is ahead of what this build
   understands (you're running an older loom against a newer stack).

2. **Procedures nudge** — when `procedures/` is missing or empty, `identity()` emits
   a nudge listing all six seed templates. This is not an error; the agent can dismiss
   it by adopting any procedure with `loom procedures adopt`.

3. **Harness manifest nudge** — when `LOOM_CLIENT` is set but the corresponding
   `harnesses/<client>.md` doesn't exist, `identity()` emits a stub template the agent
   can fill in. Run `loom harness init` to materialize it.

4. **Model manifest nudge** — same pattern for `LOOM_MODEL` and `models/<model>.md`.

None of these are blocking. They produce informational output in the identity payload,
not errors.

---

## alpha.7 — 2026-04-22

**Breaking change: npm package renamed `loom` → `loomai`.**

The CLI binary, MCP server key, and tool prefix (`mcp__loom__*`) are all unchanged.
Only the npm install surface changed.

### What you need to do

1. Update your install command:

   ```bash
   # Old (pre-alpha.7, or from GitHub directly)
   npx loom install
   npx github:jbarket/loom install

   # New (alpha.7+)
   npx loomai install
   ```

2. If you have a global install of `loom`, uninstall it and reinstall `loomai`:

   ```bash
   npm uninstall -g loom
   npm install -g loomai
   ```

3. **MCP config does not change.** The server still runs as `node dist/index.js` with
   no subcommand, and the key in your `.mcp.json` stays `"loom"`.

4. **Harness dotfiles do not change.** `loom inject` still writes the same managed
   block; re-running is idempotent.

### What's new

- Published to npm with Sigstore provenance (first tagged release).
- `release.yml` tag-triggered publish pipeline.

---

## alpha.6 — 2026-04-21

### What you need to do

Nothing. All changes are additive. `wake` works as before.

### What's new

- **`loom install`** — writes the bundled `loom-setup` skill into your harness's
  skills directory. First-run setup is now `npx loomai install` + `/loom-setup`.
- **`loom doctor`** — probes the environment: Node version, stack compatibility,
  existing agents, per-agent git state. `--json` for scripting.
- **`assets/skill/SKILL.md`** — bundled setup skill that drives the full first-run
  flow inside the harness (probe → interview → bootstrap → inject → verify).

---

## alpha.5 — 2026-04-21

### What you need to do

Nothing. All changes are additive.

### What's new

- **`loom procedures list|show|adopt`** — CLI for procedural-identity seed templates.
  Six seeds ship: `verify-before-completion`, `cold-testing`,
  `reflection-at-end-of-unit`, `handoff-to-unpushable-repo`,
  `confidence-calibration`, `RLHF-resistance`.
- **`loom harness init`** — scaffolds a harness manifest from the spec template.
- MCP tools `procedure_list`, `procedure_show`, `procedure_adopt`, `harness_init`
  mirror the above CLI commands.

### Optional action

Run `loom procedures adopt --all` to materialize the seed templates into
`<context>/procedures/`. The identity payload will then show them as adopted rather
than nudging.

---

## alpha.4 — 2026-04-20

### What you need to do

Nothing. All changes are additive.

### What's new

- **`loom inject`** — writes a marker-bounded managed section into harness dotfiles
  (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`). Idempotent;
  preserves user content outside the managed block.

### Optional action

Run `loom inject --all --context-dir <your-context-dir>` to inject the identity pointer
into your harness dotfiles. This gives harnesses a shell-fallback (`loom wake`) if MCP
is unavailable.

---

## alpha.3 — 2026-04-20

### What you need to do

Nothing. The MCP interface is unchanged; CLI is new and additive.

### What's new

- **Full CLI surface** — every MCP tool now has a `loom <subcommand>` shell equivalent:
  `wake`, `recall`, `remember`, `update`, `forget`, `memory list`, `memory prune`,
  `pursuits`, `update-identity`, `bootstrap`, `serve`.
- `--json` on any command emits the tool's structured return value.
- Write commands accept body text via stdin (piped) or `$VISUAL`/`$EDITOR` (TTY).

---

## alpha.2 — 2026-04-20

### What you need to do

Nothing. All changes are additive.

### What's new

- **Procedures seed content** — 6 recommended seed templates shipped (previously the
  procedures reader existed but no content was bundled).
- **`seedNudge()`** — identity payload now includes a nudge when `procedures/` is
  missing or empty. This is purely informational.

---

## alpha.1 — 2026-04-19

### What you need to do

If you are upgrading from a pre-alpha.1 commit:

1. **Stack version stamp** — loom now writes `LOOM_STACK_VERSION=1` to the context
   dir on first boot. This is automatic; no action needed.

2. **Harness / model manifests** — loom now loads per-harness manifests from
   `harnesses/<client>.md` and per-model manifests from `models/<model>.md` when
   `LOOM_CLIENT` or `LOOM_MODEL` are set. These files are optional; if they're missing,
   `identity()` emits a stub template to fill in. No action needed.

### License change

**MIT → AGPL-3.0-or-later.** This change took effect at alpha.1. Pre-alpha.1
commits remain MIT. See [Migration: v0.3.x → v0.4](migration/v0.3-to-v0.4.md) for
details on what the AGPL means in practice.

---

## Older versions

For the full v0.3.x → v0.4 migration (Qdrant → sqlite-vec), see
[docs/migration/v0.3-to-v0.4.md](migration/v0.3-to-v0.4.md).
