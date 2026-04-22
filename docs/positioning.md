# loom vs. other memory systems

"Why not just use X?" is a fair question. This doc answers it for five
common alternatives. No marketing, no strawmen. Where loom is less
convenient than an alternative, it says so.

## loom in one paragraph

A single-binary MCP server that stores an agent's terminal creed,
preferences, self-model, pursuits, and episodic memory in one context
directory — a handful of markdown files plus one `memories.db`
(SQLite + sqlite-vec). Local-only, no daemon, no hosted service,
AGPL-3.0-or-later. The shape treats *identity* as a first-class
concern separate from episodic memory, and keeps the identity files
voice-neutral so the agent can be any voice on any model or harness.

## vs. Mem0

Mem0 is memory-as-a-service: you send it conversation turns over HTTP,
it runs LLM-based extraction to pull out durable facts, it indexes
them in a vector store, and you query by user/session. It has SDKs
for most languages, a hosted tier with auth and multi-tenancy, and a
self-hosted OSS core. If you're building a consumer product where
"users" are the unit of isolation and memory has to work across
thousands of accounts with minimal integration work, Mem0 is the
shorter path — loom has none of that (no auth, no REST API, no UI).
Loom picks a different problem: one agent, one operator, identity
*and* memory together, zero external services. Pick Mem0 when you're
shipping user-facing memory at scale; pick loom when you're giving
one agent continuity across the stack you run it on.

## vs. Zep

Zep models memory as a temporal knowledge graph — entities,
relationships, and when facts became true — and is good at temporal
reasoning ("what did the user say about X last week vs. now"). It has
a polished hosted offering plus a Community Edition. If your
application needs fact evolution over time with first-class temporal
queries, Zep does that better than loom does. Loom's recall is
simpler: cosine similarity over BGE-small embeddings of free-form
markdown, with categories and optional TTL. No graph, no relationship
extraction, no temporal resolver. Pick Zep when you need to reason
about *when* things were true; pick loom when flat-file episodic
memory plus a persistent creed is enough.

## vs. Letta / MemGPT

Letta (the production descendant of the MemGPT research) is an agent
*framework* with a memory hierarchy baked in — core memory blocks
always in context, archival storage paged in on demand, the agent
itself uses tools to move memories between tiers. That design is the
right answer if you want the agent to manage its own context window
actively, and Letta ships a server, SDKs, and a UI for it. Loom is
not a framework — it exposes ten MCP tools and expects the harness
(Claude Code, Codex, Gemini CLI, OpenCode) to *be* the runtime. You
give up Letta's integrated agent loop and UI; you gain the ability to
swap the harness, the model, or the vendor without touching the
memory. Pick Letta when you want one system that runs the agent and
owns its memory; pick loom when the runtime is already chosen and you
want continuity across runtimes.

## vs. Claude's `memory_20250818` tool

Anthropic's memory tool is a client-side tool the model can call to
read and write files under a path you control — essentially "the
model gets a scratch directory, the client persists it." It lives at
the API layer, so it works in any integration that speaks the
Anthropic API, and it's minimal by design. That minimalism is a
strength: no daemon, no extra infra, no opinions about shape. Loom
overlaps here and is more opinionated — it prescribes an identity
structure (creed / preferences / self-model / pursuits / procedures),
ships semantic recall, and works across Anthropic, Google, and local
models through MCP rather than a single vendor's API. Pick
`memory_20250818` when you're Anthropic-only and want the smallest
possible surface; pick loom when you want the same agent to persist
across Claude, Gemini, and local runtimes — or when you want identity
to be more than a freeform folder.

## vs. harness-native memory (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`)

These are markdown files each harness reads on session start. Simple,
free, already there, version-controllable with your repo. For most
projects that's the right tool: a short file describing house style,
build commands, and project conventions, loaded every turn. Loom
doesn't replace them — `loom inject` writes a small managed section
*into* them that points at `mcp__loom__identity`. The difference is
scope: harness-native files are project- or user-scoped static
context; loom is an agent-scoped persistent store with episodic
memory and semantic recall. Pick the harness file alone when static
context is enough; pick loom (plus the harness file) when you want
the agent to accumulate experience and carry it between harnesses.

## Where loom is less convenient

- No UI. Everything is markdown, SQLite, and CLI.
- Self-hosted only. There is no hosted tier and no plan for one.
- AGPL-3.0-or-later. If you ship a closed-source network service that
  embeds a modified loom, you owe users the corresponding source.
  Linking loom into a larger product you distribute as source, or
  running it privately, is unaffected.
- Single-user by design. No auth, no multi-tenancy, no sharing
  primitives.
- MCP-first. If your harness doesn't speak MCP, you fall back to the
  CLI and lose the live tool surface.
- Opinionated stack. One backend (sqlite-vec), one embedder
  (BGE-small via fastembed), no env-driven swap. You can implement
  the interfaces and replace the concrete classes, but there's no
  configuration knob.

## Bottom line

Loom is the right answer if you run one agent (or a small number),
want it to persist across models and harnesses you choose, and treat
identity as a real thing rather than a conversation history. For
other shapes — multi-user products, deep temporal reasoning,
integrated agent runtimes, Anthropic-only minimalism — one of the
systems above fits better. Pick the smallest thing that solves your
problem.
