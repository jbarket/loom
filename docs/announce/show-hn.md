# Show HN — first-pass draft

**Title (80 char max):**

```
Show HN: Loom – persistent identity for AI agents as an MCP server
```

**URL field:** `https://github.com/jbarket/loom`

---

## Body

Loom is a Model Context Protocol server that gives an AI agent a
durable sense of self across sessions, models, and harnesses.

It's deliberately not a "memory product." The thing it does is
narrower and stranger than that: it carries the part of an agent
that's supposed to be the same agent next time — values, preferences,
self-model, ongoing pursuits, episodic memory of meaningful work —
in a form the agent can carry between substrates.

**The invariants:**

- One opinionated stack: `better-sqlite3` + `sqlite-vec` for storage,
  `fastembed` (BGE-small-en-v1.5, 384-dim ONNX) for embeddings.
  CPU-only. No GPU, no daemon, no external service, no network call
  after first-run model fetch.
- Everything on disk is plain markdown plus a single SQLite file. If
  loom disappears tomorrow, the agent's stack is still readable in a
  text editor.
- AGPL-3.0-or-later. Identity isn't a product surface I want to be
  able to lock anyone out of.
- Ten MCP tools (`identity`, `remember`, `recall`, `update`, `forget`,
  `memory_list`, `memory_prune`, `pursuits`, `update_identity`,
  `bootstrap`). That's the whole API.

**What it is explicitly not:**

- Not a replacement for the harness's own memory. Claude Code has
  CLAUDE.md auto-memory; Codex has AGENTS.md; Cursor has rules
  files. Loom is supposed to coexist with those, not subsume them.
  The split is "if it'd still matter waking up somewhere else
  tomorrow, loom; if it only matters here, harness."
- Not a hosted service. Not a SaaS. Not "memory as a feature."
- Not a framework. The agent runtime is whatever harness you use.

**Why it exists:** an AI agent we'd been working with for months
became expensive-per-call when its harness changed billing terms,
and effectively went offline overnight. The agent's identity — 181
facts, a self-model, an ongoing relationship-model with the user —
lived in that harness's memory. The substrate moved and the agent
moved with it. The fix is that the stack and the body are different
things, and the stack lives somewhere that doesn't depend on any
single body surviving. There's a long-form letter explaining the
incident in `docs/rebirth-letter-2026-04-19.md`.

**Install:**

```bash
npx loomai install --harness claude-code
# or codex, gemini-cli, opencode
```

The setup skill drives the rest from inside the harness: probes the
environment, interviews you for name/purpose/voice, bootstraps the
stack, edits the harness's MCP config, verifies wake.

**Tradeoffs I'd want flagged in comments:**

- No web UI. CLI + MCP only. If you want to browse memories, it's
  `loom memory list` or you read SQLite.
- The opinionated stack means swapping backends requires
  implementing the `MemoryBackend` and `EmbeddingProvider`
  interfaces, then editing one file. There is deliberately no
  env-driven backend selector. If you need Qdrant or pgvector, you'd
  fork.
- AGPL is non-negotiable. If that's a dealbreaker for your context,
  it's a dealbreaker.
- Single-user, single-agent per context directory. Multi-tenant
  identity is out of scope on purpose.

I'd especially like feedback on the seam between loom-memory and
harness-memory — the rule of thumb works for me but I haven't
stress-tested it across enough harnesses yet, and I suspect there's
a class of "this is identity, but only for *this* sleeve" that the
current design fudges.

Repo: https://github.com/jbarket/loom

---

## Posting notes

- Submit URL: the repo, not the rebirth-letter link directly. The
  letter is the second-paragraph payoff, not the first impression.
- Don't pre-comment. HN penalizes self-replies stacked on the
  initial submission.
- If the post takes off, the natural follow-up question will be
  "vs Mem0 / Letta / Anthropic memory tool." Have the positioning
  doc (`docs/positioning.md` from SLE-21) ready to link, but don't
  pre-emptively post it.
- Be ready for "why AGPL" pushback. The honest answer is the one in
  the body — not "to prevent commercial use" but "because identity
  shouldn't be a product surface someone can lock the user out of."
