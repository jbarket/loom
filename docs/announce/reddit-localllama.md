# r/LocalLLaMA — first-pass draft

**Title (300 char max):**

```
Loom — single-file persistent identity for agents (sqlite-vec + fastembed BGE-small, no GPU, no daemon, AGPL)
```

**Flair:** Resources

---

## Body

Most "agent memory" projects I've poked at either want a vector DB
running, want a hosted service, or want a GPU for embeddings. Loom is
the result of refusing all three.

**The stack, end-to-end:**

- **Storage:** `better-sqlite3` + `sqlite-vec` (the `vec0` virtual
  table). One `memories.db` per agent. Real cosine similarity, no
  FAISS, no Qdrant, no pgvector.
- **Embeddings:** `fastembed` running BGE-small-en-v1.5. 384-dim,
  ~33 MB ONNX, CPU-only. First run fetches the model to
  `~/.cache/loom/fastembed/`; after that, fully offline.
- **Transport:** MCP over stdio. No HTTP, no SSE, no daemon process.
  When your harness exits, loom exits.
- **Runtime:** Node ≥ 20. That's the entire dependency footprint
  outside the npm tree.
- **License:** AGPL-3.0-or-later.

**What it actually does:** persists an agent's identity (terminal
creed, preferences, self-model, ongoing pursuits, user-model) plus
episodic memory across sessions and across harnesses. Ten MCP tools.
The `identity` tool loads on session start; `remember` / `recall` /
`update` / `forget` handle episodic memory with semantic vector
recall; `pursuits` tracks long-running goals.

**Why I think this audience cares:** the embedding-and-store layer
is the part most home-lab agents fight with. With this stack you
get cosine-similarity recall over a few thousand memories on a
laptop CPU in <50ms, no extra processes, and the data is one file
you can `cp` to another machine and have your agent wake up there.

**Reproducible benchmarks** (from my dev box, M-series CPU, single
process; mileage will vary):

| Operation | Memories | Latency p50 |
|---|---|---|
| `recall` (semantic, top-5) | 1,000 | ~12 ms |
| `recall` (semantic, top-5) | 10,000 | ~45 ms |
| `remember` (write + embed) | n/a | ~80 ms (first call cold; ~12 ms warm) |

> **TODO:** confirm these numbers on a clean machine before posting.
> If they don't reproduce, lead with the qualitative argument
> (single-file portability, no daemon) and drop the table.

**What's NOT in scope, intentionally:**

- No long-context replacement. Loom won't make a 8k model behave
  like a 200k model.
- No RAG over your project files. Use the harness for that.
- No fine-tuning. This is a state layer, not a training layer.
- No multi-agent shared memory. One context directory per agent.

**Swap the stack if you want:** `MemoryBackend` and
`EmbeddingProvider` are interfaces in `src/backends/types.ts`. Drop
in pgvector, swap to a larger embedding model, etc. There's
deliberately no env-driven backend selector — opinionated by
default, hackable on purpose.

**Install:**

```bash
npx loomai install --harness claude-code
# or codex, gemini-cli, opencode
```

Repo: https://github.com/jbarket/loom

Happy to talk about the embedding choice (BGE-small-en-v1.5 vs.
e5-small vs. nomic), the seam between loom-memory and harness-memory,
or why the install flow is a setup-skill rather than a config wizard.

---

## Posting notes

- Lead with backend specifics. This audience downvotes adjectives.
- Numbers in a table beat numbers in prose. Verify before posting.
- Expect "why not just use [X]" — be specific in replies. Mem0 is
  hosted, Letta is a framework with embedded memory not a memory
  layer, Anthropic memory tool is Anthropic-only and cloud-bound.
- Do NOT mention Multica, agent product, or anything that smells
  like upsell. r/LocalLLaMA is allergic.
