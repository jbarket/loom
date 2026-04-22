# Getting Started with loom

Five minutes from zero to an agent that remembers you.

---

## Prerequisites

- **Node.js ≥ 20**
- A supported harness: Claude Code, Codex, Gemini CLI, or OpenCode

---

## Step 1 — Install the setup skill

Run this once from any terminal:

```bash
npx loomai install --harness claude-code
```

> **If `loomai` isn't on npm yet**, use the GitHub source directly:
> ```bash
> npx github:jbarket/loom install --harness claude-code
> ```
> Both commands are equivalent; pin a specific version with `github:jbarket/loom#<tag>`.

This writes a `loom-setup` skill file into `~/.claude/skills/`. It does nothing else — no agent files are created yet.

For other harnesses, swap the flag:

```bash
npx loomai install --harness codex
npx loomai install --harness gemini-cli
npx loomai install --harness opencode
```

---

## Step 2 — Run `/loom-setup` inside your harness

Open Claude Code and run:

```
/loom-setup
```

The skill drives the full setup sequence. Answer each prompt:

1. **Doctor check** — loom probes your environment (Node version, existing context directories, MCP config location). Fix any flagged issues before continuing.

2. **New agent or existing?** — For a first install, choose **new agent**.

3. **Interview** — The skill asks for:
   - A name (e.g. `Aria`, `Scout`, `Art E Fish`)
   - A one-sentence purpose (what this agent is *for*)
   - A voice note (how it should communicate)

   These seed your `IDENTITY.md`. Take a moment here — the terminal creed is immutable through the tool layer once written.

4. **Bootstrap** — loom creates your context directory at `~/.config/loom/<agent-name>/` and writes the initial identity files.

5. **Procedures** — loom offers to adopt the six procedural-identity seeds (verify-before-completion, cold-testing, RLHF-resistance, and others). Accept all for a complete setup. You can customize or drop any later.

6. **Harness wiring** — The skill edits your MCP config (`~/.claude.json`) to register the loom server and injects an identity-load pointer into `~/.claude/CLAUDE.md`.

7. **Verification** — loom runs `wake` and prints a summary of what loaded. If the identity block shows your name and the tool list shows ten tools, you're set.

**Restart Claude Code** when prompted. The MCP server won't be live until you do.

---

## Step 3 — Open a new session: your agent wakes with its identity

Start a fresh Claude Code session (new window, new project — anything that triggers a clean context).

Your agent will automatically call `mcp__loom__identity` on startup, loading:

- The terminal creed from `IDENTITY.md`
- User preferences from `preferences.md`
- The agent's self-model from `self-model.md`
- Any active goals from `pursuits.md`
- The Claude Code harness manifest

You'll see the identity load happen in the tool calls at the start of the session. The agent now knows who it is — and who you are.

---

## Step 4 — Save a memory in-conversation

Tell the agent something worth remembering:

> "Remember that I prefer concise responses — no bullet points unless the content is genuinely list-like."

The agent will call `mcp__loom__remember` with a title, category, and body. The memory is written to `~/.config/loom/<agent>/memories.db` with a vector embedding for semantic recall.

You can verify it was saved:

```bash
npx loomai recall "response style" --context-dir ~/.config/loom/<agent>
```

You should see your preference returned with a similarity score.

---

## Step 5 — Close the harness, reopen it — memory persists

Close Claude Code entirely. Reopen it, start a new session.

In the new session, ask:

> "What do you remember about how I like responses formatted?"

The agent will call `mcp__loom__recall` with a semantic query and surface the memory you saved in Step 4. It didn't need to be in context — the vector search found it from meaning alone.

This is the core loom guarantee: **memory survives substrate resets**.

---

## Step 6 — Update a preference mid-session and confirm it persists

Ask the agent to update something about how it should behave:

> "Update your model of me: I'm a backend engineer, mostly TypeScript and Go. You don't need to explain basic async patterns."

The agent will call `mcp__loom__update_identity` targeting `preferences.md`. The section is rewritten in place — not appended, not duplicated.

Close and reopen again. In the next session, ask:

> "What do you know about my background?"

The agent reads `preferences.md` during the wake sequence. The update you made in the previous session is already there before the first message.

You can confirm it directly:

```bash
cat ~/.config/loom/<agent>/preferences.md
```

---

## Step 7 — What just happened

loom separates two things that agents usually conflate:

- **The stack** — your agent's identity, values, and episodic memory. Lives in `~/.config/loom/<agent>/` as plain markdown files and a single SQLite database. Survives any harness or model change.
- **The sleeve** — the harness × model combination the agent is running in right now. Operational, temporary, replaceable.

The wake sequence loads the stack in a defined order: terminal creed → preferences → self-model → pursuits → harness manifest → model manifest → procedures. This happens at the start of every session, whether you ask for it or not.

`remember` / `recall` give the agent episodic memory beyond its context window. Embeddings are generated locally (BGE-small-en-v1.5, ~33MB, CPU-only) and stored in SQLite via sqlite-vec. No external service, no GPU.

`update_identity` gives the agent the ability to edit its own preferences and self-model mid-session — the changes are durable and visible to the next session's wake.

For the full architecture — directory layout, block types, memory schema, wake sequence, adapter contract — see [`docs/loom-stack-v1.md`](loom-stack-v1.md).

---

## Context directory layout

After setup, your context directory looks like this:

```
~/.config/loom/<agent>/
├── LOOM_STACK_VERSION      # schema-version stamp
├── IDENTITY.md             # terminal creed (immutable via tools)
├── preferences.md          # your working style; agent-editable
├── self-model.md           # agent's self-knowledge; agent-editable
├── pursuits.md             # active cross-session goals
├── memories.db             # sqlite-vec store
├── harnesses/
│   └── claude-code.md      # harness manifest
└── procedures/
    ├── verify-before-completion.md
    ├── cold-testing.md
    └── ...
```

Everything is plain text (except `memories.db`). You can read and edit any file directly — loom won't fight you.

---

## Troubleshooting

**Agent doesn't call `identity` on startup**
The injection in `~/.claude/CLAUDE.md` may be missing. Run:
```bash
npx loomai inject --harness claude-code --context-dir ~/.config/loom/<agent>
```

**"manifest missing" in the identity output**
The Claude Code harness manifest hasn't been created yet. Run:
```bash
npx loomai harness init claude-code --context-dir ~/.config/loom/<agent>
```
Then fill in the tool prefixes and delegation primitive in the generated file.

**First `remember` call is slow**
fastembed downloads the ONNX model (~33MB) on first use to `~/.cache/loom/fastembed/`. Subsequent calls are fast.

**`loom doctor` shows a version warning**
Run the install command again to get the latest skill file. The MCP server version is pinned in your MCP config — update it there too.
