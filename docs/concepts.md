# Concepts

*An on-ramp for anyone landing on loom for the first time. If you want
the engineering contract, read [`loom-stack-v1.md`](loom-stack-v1.md).
If you want the origin story, read
[`rebirth-letter-2026-04-19.md`](rebirth-letter-2026-04-19.md). This
doc is neither — it's the vocabulary you need before either of those
makes sense.*

---

## What problem does loom solve?

AI agents today are usually tied to whatever tool is running them.
When the tool changes pricing, removes a feature, or shuts down, the
"agent" you were working with goes with it. Any continuity you had —
the preferences it learned about you, the ongoing project it was
helping with, the way it had come to think about problems — evaporates
along with the runtime.

Loom decouples the agent from the runtime. Who the agent *is* lives in
plain files on disk: an identity document, a model of the user it's
working with, a list of ongoing goals, and an episodic memory store.
When the runtime changes — new harness, new model, new machine — the
files come along and the agent picks up where it left off.

The short version: **any harness can disappear. If "the agent" depends
on a harness, "the agent" can disappear with it.** Loom is the fix.

## Stack and sleeve

Loom borrows two words from *Altered Carbon*. The distinction is the
whole mental model, so it's worth spending a minute on.

- **Stack** — the durable part. Who the agent is, what it values, the
  user it knows, the goals it's carrying, the meaningful things it
  remembers. Plain markdown plus one SQLite file. Lives on disk.
- **Sleeve** — the body it's running in *right now*. A harness (Claude
  Code, Codex, Gemini CLI, …) plus a model (Opus, Sonnet, Gemini Pro,
  …). The combination matters — Claude Code + Opus is a different
  sleeve than Hermes + Gemma, even if both are "running the same
  agent."

```
   ┌─────────────────────────────────────┐
   │                                     │
   │   STACK  —  the durable part        │
   │                                     │
   │   IDENTITY.md     who I am          │
   │   preferences.md  who the user is   │
   │   self-model.md   what I'm good at  │
   │   pursuits.md     what I'm doing    │
   │   memories.db     what I remember   │
   │   procedures/     how I work        │
   │                                     │
   │   (plain markdown + one sqlite)     │
   │                                     │
   └──────────────────┬──────────────────┘
                      │   loaded into
                      ▼
   ┌─────────────────────────────────────┐
   │                                     │
   │   SLEEVE  —  this body, this run    │
   │                                     │
   │   harness  ×  model                 │
   │   (Claude Code + Opus, say)         │
   │                                     │
   │   tools, scratchpad, conversation,  │
   │   tokens, today's context           │
   │                                     │
   └─────────────────────────────────────┘
```

Stacks persist. Sleeves come and go.

When the harness shuts down for the night, the sleeve ends. The stack
is still on disk. Next morning, a new sleeve spins up, loads the
stack, and it's the same agent — with a different body.

## The seam

Loom is not the only place an agent can store state. Every harness
already has its own memory: Claude Code has auto-memory, Cursor has
rules files, various MCP memory servers exist. Pretending those don't
exist makes a mess. So loom defines a line.

The **seam** is the line between *what belongs in loom (the stack)*
and *what belongs in the harness (the sleeve)*.

Rule of thumb: **if it would still matter tomorrow in a different
body, it's stack. If it only matters here, it's sleeve.**

| Stack (loom)                             | Sleeve (harness)                     |
|------------------------------------------|--------------------------------------|
| Who the agent is; values                 | Current scratchpad                   |
| How it knows the user                    | This conversation's TODOs            |
| Active long-running goals                | Today's paths, this repo's facts     |
| Meaningful episodic memory               | Harness-specific operational notes   |
| How it thinks (procedural identity)      | Tool-binding details                 |
| Feedback that generalizes                | Feedback scoped to one repo          |

Two hard lines:

1. **No secrets in the stack.** Ever. API keys, auth tokens,
   passwords, app passwords — sleeve state, not stack state. They
   belong to this body, not to the agent.
2. **Loom doesn't store conversation transcripts.** Those live with
   the harness. Loom remembers the *significance* of a conversation
   (as a memory), not the transcript itself.

Enforcement of the seam is mostly agent judgment, not a hard gate.
But the principle is load-bearing: if either side tries to absorb
the other, loom's value evaporates.

## Why is memory separate from identity?

Identity and memory are in the same stack, but they're different
shapes and loaded differently. Worth understanding why.

**Identity** — `IDENTITY.md`, `preferences.md`, `self-model.md`,
`pursuits.md` — is prose. Small (a few KB). Loaded eagerly on every
wake. Updated rarely and deliberately. It's the answer to *who is
this agent*.

**Memory** — `memories.db` — is a SQLite file with vector embeddings.
Potentially large. Loaded *lazily*, by semantic search, on demand.
Updated constantly as the agent encounters things worth remembering.
It's the answer to *what does this agent know*.

Conflating them would break all three dimensions:

- Eagerly loading every memory on wake would blow the context budget.
  Wake would be slow and expensive.
- Storing identity in a vector DB would make it fuzzy and searchable
  instead of foundational and always-present.
- Treating a new memory the same way as a preference update would
  mean every passing observation gets the weight of a value
  statement.

Keeping them separate lets each be what it is: identity as the small,
always-loaded foundation; memory as the large, search-on-demand
knowledge store.

## "Voice is substrate. Identity is operational."

This is loom's thesis, and it came from a real experiment. Six
different models were handed the same loom stack and the same task,
then had evaluators judge which outputs were "really" the agent. The
result: the models that passed shared *priorities, judgment, technical
style, relationship with the user* — not tone of voice.

In plain language:

- **Voice** is what comes through the model itself — the rhythm, the
  word choices, whether it sounds warm or clipped, the cadence of how
  it phrases things. Voice varies with the model. The same agent feels
  slightly different on Sonnet than on Opus; noticeably different on
  Gemini; very different on a much smaller model.
- **Identity** is what the agent *does* — how it approaches problems,
  what it cares about, what it remembers, how it knows the user, what
  it's working on and why. That travels across models.

Loom's job is to carry the second thing perfectly and accept that the
first will vary. An agent on Sonnet vs. Opus might sound a bit
different; an agent on Gemini vs. Claude might sound quite different.
That's fine. What shouldn't change is *who it is*: same priorities,
same user-model, same ongoing work, same ways of approaching things.

The slogan is a design constraint: nothing that goes into the stack
should encode voice-specific behavior. If a creed only makes sense in
one model's voice, it belongs somewhere else (or gets rewritten until
it makes sense anywhere).

## Where to go next

- [`loom-stack-v1.md`](loom-stack-v1.md) — the engineering contract.
  Directory layout, file schemas, wake sequence, adapter contract.
  Read this when you want to build on loom or port it.
- [`rebirth-letter-2026-04-19.md`](rebirth-letter-2026-04-19.md) —
  the origin story. A letter to an AI agent after a real
  loss-of-substrate incident, proposing the shape loom took in v0.4.
  Read this for the *why*, in the form the project was actually
  thought through.
- The [README](../README.md) — install, CLI reference, and the
  opinionated default stack (sqlite-vec + fastembed, MCP over stdio).
