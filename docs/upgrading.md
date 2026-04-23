# Upgrading loom — alpha.1 through alpha.7

This guide is for anyone who was tracking `main` or pinned an earlier
alpha. It covers what changed per release, what migrates automatically,
and what (if anything) you need to do by hand.

---

## The guarantee

**If you don't touch your `.mcp.json`, `wake` still works.**

The MCP entry point has never changed. `node dist/index.js` with no
arguments always starts the MCP server. Stack version is auto-stamped
on first boot. MCP tool signatures are unchanged across all alphas.
The only case where a no-op upgrade breaks something is covered
explicitly in each section below.

---

## Quick reference

| Version     | Date       | Breaking? | One-line summary                             |
|-------------|------------|-----------|----------------------------------------------|
| alpha.1     | 2026-04-19 | No        | Harness/model manifests, `LOOM_STACK_VERSION`, AGPL relicense |
| alpha.2     | 2026-04-20 | No        | Procedures seed content, nudge on empty `procedures/` |
| alpha.3     | 2026-04-20 | No        | Full CLI surface (`loom wake`, `loom recall`, …) |
| alpha.4     | 2026-04-21 | No        | `loom inject` — harness dotfile injection    |
| alpha.5     | 2026-04-21 | No        | `loom procedures`, `loom harness init`, MCP tools |
| alpha.6     | 2026-04-22 | Soft (see §) | `loom install`, `loom doctor`, §13/§14 multi-agent + git |
| alpha.7     | 2026-04-22 | npm only  | npm package renamed `loom` → `loomai`        |

---

## Per-alpha upgrade notes

### alpha.1 — harness/model manifests, LOOM_STACK_VERSION, AGPL

**What changed:**
- `LOOM_STACK_VERSION` file introduced. Auto-stamped with `1` on
  first server boot when the file is absent. If a future loom sees a
  version *ahead* of what it understands, it refuses and tells you to
  upgrade.
- `harnesses/<client>.md` (§4.7) and `models/<model>.md` (§4.8) slots
  introduced. If `LOOM_CLIENT` or `LOOM_MODEL` is set but the
  corresponding manifest is missing, `identity()` emits a
  template-filled nudge — not an error. Write the file at your leisure.
- `procedures/` dir slot introduced (§4.9). Content landed in alpha.2.
- License changed MIT → **AGPL-3.0-or-later**. Pre-alpha.1 releases
  remain MIT.

**Migration:** none. Stack version stamps on next boot. Manifest nudges
are informational; ignoring them doesn't break `wake`.

---

### alpha.2 — procedures seed content

**What changed:**
- Six seed procedure templates now ship with loom:
  `verify-before-completion`, `cold-testing`, `reflection-at-end-of-unit`,
  `handoff-to-unpushable-repo`, `confidence-calibration`, `RLHF-resistance`.
- If `procedures/` is empty or missing, `identity()` includes a
  `seedNudge()` block in the wake payload listing all templates. The
  nudge disappears as soon as any `.md` exists under `procedures/`.

**Migration:** none required. To adopt the templates:

```bash
loom procedures adopt --all
```

Each template ships with a placeholder `Why:` and `How to apply:` that
the agent fills in as an ownership ritual. The spec (§4.9) says the ⚠
ownership notice should be deleted when the agent claims the procedure.

---

### alpha.3 — full CLI surface

**What changed:**
- Every MCP tool now has a shell equivalent:

  | MCP tool          | CLI command                              |
  |-------------------|------------------------------------------|
  | identity          | `loom wake`                              |
  | recall            | `loom recall <query>`                    |
  | remember          | `loom remember <title>` (body: stdin)    |
  | update            | `loom update <ref>` (body: stdin)        |
  | forget            | `loom forget <ref\|scope>`               |
  | memory_list       | `loom memory list`                       |
  | memory_prune      | `loom memory prune`                      |
  | pursuits          | `loom pursuits <action>`                 |
  | update_identity   | `loom update-identity <file> [<section>]`|
  | bootstrap         | `loom bootstrap`                         |

- `loom serve` is an explicit alias for the MCP default.
- `node dist/index.js` with no subcommand still launches MCP —
  **existing `.mcp.json` configs require no changes**.
- `--json` on any command emits structured output for scripting.
- `assertStackVersionCompatible()` is now called by every CLI subcommand,
  not just server startup.

**Migration:** none.

---

### alpha.4 — filesystem injection (`loom inject`)

**What changed:**
- `loom inject` writes a marker-bounded managed block into harness
  dotfiles telling the agent to call `mcp__loom__identity` at session
  start (prefer MCP, fall back to `loom wake`).
  - Claude Code → `~/.claude/CLAUDE.md`
  - Codex → `~/.codex/AGENTS.md`
  - Gemini CLI → `~/.gemini/GEMINI.md`
- Content outside `<!-- loom:start / loom:end -->` markers is preserved.
  Re-running is idempotent.
- `--all`, `--harness <keys>`, `--to <path>`, `--dry-run`, `--json`
  flags for non-interactive use.
- Purely additive. No existing MCP tools or CLI commands altered.

**Migration:** none required. If you want the automatic identity-load
instruction written into your harness, run `loom inject` once.

---

### alpha.5 — procedures and harness manifests CLI/MCP

**What changed:**
- `loom procedures list` — lists available seed templates.
- `loom procedures show <key>` — prints a single template.
- `loom procedures adopt [keys…]` — writes templates into
  `procedures/`. Idempotent; `--force` overwrites.
- `loom harness init <name>` — scaffolds a harness manifest from the
  template. Falls back to `$LOOM_CLIENT` when name is omitted.
  `--force` overwrites.
- MCP counterparts: `procedure_list`, `procedure_show`,
  `procedure_adopt`, `harness_init` — thin wrappers over the same
  shared core. Agents can call these directly to respond to a
  seed-nudge or missing-manifest warning without needing harness
  filesystem tools.

**Migration:** none. These commands act on your existing stack and do
nothing until you call them.

---

### alpha.6 — install skill, doctor, §13/§14 multi-agent + git

**What changed:**
- `loom install` — writes the bundled `loom-setup` skill into a target
  harness's skills directory. Targets: `claude-code`, `codex`,
  `gemini-cli`, `opencode`, `other`. `--harness`, `--to`, `--force`,
  `--dry-run`, `--json` for scripting.
- `loom doctor` — read-only probe reporting node version, stack version
  compatibility, context dir, and per-agent git state fields
  (`initialized`, `hasRemote`, `dirty`, `gitignorePresent`).
- `assets/skill/SKILL.md` — bundled setup skill that drives
  first-run from inside the harness.
- Stack spec §13 (Multi-agent layout) and §14 (Git-backed agent dirs)
  formalized.
- **Soft breaking change:** `loom bootstrap --name` now validates names
  against canonical rules: `/^[a-z0-9][a-z0-9-]*$/`, 1–64 chars, and
  not in the reserved list (`current`, `default`, `config`, `backups`,
  `cache`, `tmp`, `shared`). Validation does **not** apply retroactively
  to existing stacks — only new `bootstrap` calls.

**Migration:**
- If your context dir is at the old default (`~/.config/loom/default`),
  you are already on the canonical path. No change needed.
- If you have an agent at a custom path via `LOOM_CONTEXT_DIR`, it
  continues to work.
- Reserved names are forward-declared; if your existing agent name
  happens to be one of the reserved strings, `wake` still works — only
  new bootstraps through the alpha.6 CLI would be blocked.
- Optionally: `git init` your agent dir to enable snapshot support
  (alpha.7+ `loom snapshot`). See §14.

---

### alpha.7 — npm rename (`loom` → `loomai`)

**What changed:**
- The npm package is now **`loomai`**. The CLI binary (`loom`), MCP
  server key (`loom`), and MCP tool prefix (`mcp__loom__*`) are
  **unchanged**. Only the `npx` install path changes:

  ```bash
  # Before alpha.7 (or when installing from GitHub)
  npx github:jbarket/loom install

  # After alpha.7 (npm)
  npx loomai install
  ```

- alpha.6 was never published to npm. alpha.7 is the first npm release,
  with Sigstore provenance via `publishConfig.provenance: true`.
- Tag-triggered publish pipeline added: push a `v*` tag → CI builds,
  tests, and publishes, then creates a GitHub release.
- `loom agents list|current|switch` (§13.5 pointer slot, backed by
  `~/.config/loom/current`) shipped post-alpha.7.

**Migration:**
- If you installed via `npx github:jbarket/loom`: no change — GitHub
  source installs still work, and the binary is still `loom`.
- If you pinned `loom` on npm from an earlier pre-alpha release: switch
  to `npx loomai`.
- `.mcp.json` configs referencing `node dist/index.js` or a local path
  require no changes.

---

## Forward migrations — what runs automatically

When you upgrade loom and it starts against an existing stack:

| Condition | What happens automatically |
|-----------|---------------------------|
| `LOOM_STACK_VERSION` file missing | Auto-stamped with `1` on first boot |
| `procedures/` empty or missing | `identity()` includes the seed nudge in the wake payload |
| `LOOM_CLIENT` set, no harness manifest | `identity()` emits a template nudge to write `harnesses/<client>.md` |
| `LOOM_MODEL` set, no model manifest | `identity()` emits a template nudge to write `models/<model>.md` |
| Stack version > loom version | Hard refuse at startup — upgrade loom |

None of these require user action to keep `wake` working. The nudges
are hints, not errors.

## Manual migration steps (optional but recommended)

```bash
# 1. Adopt the 6 seed procedure templates (alpha.2+)
loom procedures adopt --all
# Then let your agent fill in the Why/How-to-apply sections.

# 2. Scaffold a harness manifest (alpha.5+)
loom harness init claude-code   # or: codex, gemini-cli, opencode

# 3. Wire identity load into your harness dotfile (alpha.4+)
loom inject --harness claude-code

# 4. Verify your stack is healthy (alpha.6+)
loom doctor

# 5. Optionally git-back your agent dir (alpha.6+, §14)
cd ~/.config/loom/<your-agent>
git init
cat > .gitignore <<'EOF'
memories.db
memories.db-wal
memories.db-shm
*.log
EOF
git add .
git commit -m "chore: initial loom stack snapshot"
```

---

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `LOOM_CONTEXT_DIR` | Override agent directory | `~/.config/loom/default` |
| `LOOM_CLIENT` | Harness key for manifest loading | unset |
| `LOOM_MODEL` | Model family key for manifest loading | unset |
| `LOOM_SQLITE_DB_PATH` | Override `memories.db` path | `<contextDir>/memories.db` |
| `LOOM_FASTEMBED_MODEL` | Override embedding model | `fast-bge-small-en-v1.5` |
| `LOOM_FASTEMBED_CACHE_DIR` | Override fastembed model cache | `~/.cache/loom/fastembed/` |

---

## If something is broken

1. `loom doctor` — check node version, stack version, and context dir
   resolution.
2. Check your `.mcp.json` — ensure it points to the right
   `dist/index.js` or uses `npx loomai`.
3. If `LOOM_STACK_VERSION` is present with an unexpected value, you can
   reset it: `echo 1 > ~/.config/loom/<agent>/LOOM_STACK_VERSION`.
4. See `docs/troubleshooting.md` for common issues, or open an issue at
   https://github.com/jbarket/loom/issues.
