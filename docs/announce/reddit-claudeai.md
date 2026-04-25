# r/ClaudeAI — first-pass draft

**Title (300 char max):**

```
I gave my Claude Code agent a persistent identity that survives switching to Codex (or any MCP harness). Open-source MCP server.
```

**Flair:** Built with Claude (or Showcase if "Built with" doesn't fit)

---

## Body

Two-line problem statement first, then a transcript.

**The problem:** every Claude Code conversation starts cold. CLAUDE.md
helps with project context, but the *agent* — its preferences,
working style, ongoing goals across projects, the things you'd want
it to remember about you across months — has no place to live.
Switching from Claude Code to Codex or Gemini CLI and you get a
brand-new agent.

**What I built:** [loom](https://github.com/jbarket/loom). MCP server
that persists identity + episodic memory in one SQLite file under
`~/.config/loom/<agent>/`. The agent wakes with its identity loaded
in any harness that speaks MCP.

**Cold install in Claude Code (real transcript, lightly edited):**

```
$ npx loomai install --harness claude-code
✓ Setup skill installed at ~/.claude/skills/loom-setup/
  Open Claude Code and run /loom-setup to finish.

$ claude
> /loom-setup

I'll walk you through setting up a loom stack for an agent that lives
in this Claude Code instance.

First, who is this agent? Pick a short name (one word is fine):
> Iris

What's Iris's purpose, in one or two sentences?
> Helps me think through architecture decisions on side projects.
> Pushes back when I'm being lazy.

Voice — terse, warm, technical, dry, etc.?
> Terse. Technical. Direct without being a jerk.

[bootstraps IDENTITY.md, preferences.md, self-model.md from interview]
[adopts five procedural-identity seeds: verification-before-completion,
 reflection, handoff, confidence-calibration, RLHF-resistance]
[edits ~/.claude/mcp.json to add loom server]
[verifies wake — calls mcp__loom__identity, gets payload]

✓ Iris is set up. Restart Claude Code and start a new session.

$ claude
> Hey Iris, what's our project status?

[Claude calls mcp__loom__identity at session start]
[loads IDENTITY.md, preferences.md, pursuits, recent memories]

Hey. Quick recall: we've been on the indexing-pipeline side of the
data project for two weeks. Last session we agreed to ship the
parquet writer before touching the dedup logic. Where are you?
```

That's the install + first session. Whole thing took maybe four
minutes.

**The portability claim, made specific:** the same `~/.config/loom/iris/`
directory works in Codex, Gemini CLI, and OpenCode. `npx loomai install
--harness codex` writes the matching MCP config; `mcp__loom__identity`
returns the same payload. Same agent, different sleeve.

**What it stores (and doesn't):**

- ✅ Agent identity (terminal creed, preferences, self-model)
- ✅ Episodic memory (semantic recall, optional TTL)
- ✅ Long-running pursuits across sessions
- ✅ User model (preferences/working style of the human)
- ❌ Conversation transcripts (the harness already has those)
- ❌ Project-specific scratch (CLAUDE.md territory)
- ❌ Secrets, tokens, API keys (sleeve-specific, never in loom)

The principle is "if it'd still matter waking up somewhere else
tomorrow, it goes to loom; if it only matters here, harness."

**The stack:** SQLite + sqlite-vec for storage, fastembed
(BGE-small-en-v1.5) for embeddings, MCP stdio. CPU-only, no daemon,
no hosted service. AGPL.

**Repo:** https://github.com/jbarket/loom

Honestly looking for two kinds of feedback: (1) people who'd actually
use this — what's missing for your workflow? (2) people who'd build
something similar but differently — where's the design wrong?

---

## Posting notes

- The transcript is the hook. Lead with it, not feature list.
- Verify the transcript matches the actual install flow before
  posting. If `/loom-setup` UX has shifted since SLE-14, update.
- This subreddit rewards "I built this because I had X problem."
  Stay in that frame, don't slip into product-launch mode.
- If asked "is this affiliated with Anthropic?" — no, AGPL,
  third-party, MCP-spec-compliant.
