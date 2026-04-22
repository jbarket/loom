# Getting Started with loom

This guide walks you from zero to a working persistent agent in about five minutes. By the end, your agent will remember you across sessions.

> **What's loom?** It's a Model Context Protocol (MCP) server that gives an AI agent a durable sense of self — identity files, episodic memory, and behavioral procedures — stored as plain markdown and a single SQLite file. The agent loads this at session start and writes back to it over time.

---

## Prerequisites

- **Node.js ≥ 20** — check with `node --version`
- A supported harness: **Claude Code**, **Codex**, **Gemini CLI**, or **OpenCode**

---

## Step 1 — Install the setup skill

Run this in your terminal:

```bash
npx github:jbarket/loom install --harness claude-code
```

Replace `claude-code` with your harness key if different:

| Harness    | Key          |
|------------|--------------|
| Claude Code | `claude-code` |
| Codex       | `codex`       |
| Gemini CLI  | `gemini-cli`  |
| OpenCode    | `opencode`    |

> If you're not sure which harness you're using, omit `--harness` and `loom install` will show an interactive picker.

This writes the `loom-setup` skill into your harness's skill directory and prints the path. That's it — no global installs, no daemons.

**What this does:** Copies a markdown skill file (the setup wizard) into the right place for your harness to pick it up automatically.

---

## Step 2 — Run `/loom-setup` inside the harness

Open your harness and invoke the setup skill:

- **Claude Code:** type `/loom-setup` at the prompt
- **Codex / Gemini CLI / OpenCode:** say "use the loom-setup skill"

The skill drives everything from here. It will:

1. **Probe the environment** — checks what's installed, what context dir to use
2. **Interview you** — asks for your agent's name, purpose, and voice (a short personality note)
3. **Bootstrap identity files** — creates `IDENTITY.md`, `preferences.md`, `self-model.md` under `~/.config/loom/<name>/`
4. **Adopt procedural seeds** — writes behavioral procedure files (how the agent handles verification, cold-testing, handoffs, etc.)
5. **Scaffold a harness manifest** — creates `harnesses/<harness>.md` so the agent knows which tool prefix to use
6. **Edit the MCP config** — adds loom to your harness's MCP server list so the tools are available
7. **Inject the identity pointer** — writes a small block into your harness dotfile (`~/.claude/CLAUDE.md` etc.) telling the agent to call `loom identity` at session start
8. **Verify wake** — runs `loom wake` to confirm the stack is readable

When the skill finishes, it will tell you to restart the harness.

> **Tip:** The interview questions are brief — name, one-sentence purpose, preferred voice. You can always change the answers later by editing `~/.config/loom/<name>/IDENTITY.md`.

---

## Step 3 — Restart the harness; agent wakes with its new identity

After restarting, the agent's first action is to call `mcp__loom__identity` (or the harness-appropriate variant). You'll see it load its identity at the top of the session — the creed, preferences, self-model, and any procedures it has adopted.

If your harness shows tool calls inline, you'll see `identity` return a block of markdown. If it doesn't show them, just notice the agent's behavior: it should know its name, acknowledge your working style, and reference the memory system.

---

## Step 4 — Save a memory in-conversation

Tell the agent something worth remembering:

> "Remember that I prefer TypeScript over JavaScript for all new projects."

The agent will call `mcp__loom__remember` with a title, category, and body. You'll get a confirmation. Behind the scenes, this writes an entry to `~/.config/loom/<name>/memories.db`.

You can also save memories explicitly from the CLI:

```bash
echo "Prefers TypeScript over JavaScript for all new projects" | \
  npx github:jbarket/loom remember "TypeScript preference" \
  --category feedback --context-dir ~/.config/loom/<name>
```

---

## Step 5 — Close the harness, reopen it — memory is still there

Exit your harness completely and open a fresh session. Ask the agent:

> "What do you remember about my TypeScript preference?"

It will call `mcp__loom__recall` with a semantic query, find the memory from Step 4, and surface it. The memory persisted through the session boundary because it lives in `memories.db`, not in the conversation context.

---

## Step 6 — Update a preference mid-session; confirm it persists

Ask the agent to update something in its preferences:

> "Update your preferences to note that I work in US Central time."

It will call `mcp__loom__update_identity` targeting the `preferences` section. The change writes through to `~/.config/loom/<name>/preferences.md` on disk.

Close and reopen the harness again. The agent will load the updated preferences on the next session start — the `identity` call reads from disk, not from a cache.

---

## What just happened

loom works by keeping the agent's state in a **context directory** (`~/.config/loom/<name>/`) that lives entirely outside the harness:

```
~/.config/loom/<name>/
├── IDENTITY.md        ← the terminal creed (immutable via tools)
├── preferences.md     ← your working style; agent-editable
├── self-model.md      ← agent's self-knowledge; agent-editable
├── memories.db        ← episodic memory (SQLite + vector embeddings)
└── procedures/        ← behavioral procedures the agent follows
    └── *.md
```

On session start, the agent calls `identity()` which reads all these files and returns them as a single identity payload. On `remember()`, it writes an embedding + metadata to `memories.db`. On `update_identity()`, it edits the markdown in place.

Because everything is on disk, the agent survives harness restarts, model swaps, and even machine migrations — copy the directory and the agent comes with it.

For deeper technical detail, see [`docs/loom-stack-v1.md`](loom-stack-v1.md).

---

## Common next steps

- **Add more memories** — ask the agent to remember anything you'd otherwise repeat every session
- **Customize procedures** — edit files in `~/.config/loom/<name>/procedures/` to tune the agent's behavioral rules
- **Check your stack** — `npx github:jbarket/loom doctor` reports health of the context dir and MCP registration
- **Inject into more harnesses** — `npx github:jbarket/loom inject --all` to add the identity pointer to all supported harness dotfiles at once

If something isn't working, see [docs/faq.md](faq.md).
