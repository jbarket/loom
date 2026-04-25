# r/mcp — first-pass draft

**Title (300 char max):**

```
loom — MCP server for persistent agent identity + memory. Single file. CPU-only. AGPL.
```

**Flair:** Server (or Showcase)

---

## Body

MCP server. Persistent identity + episodic memory. Ten tools. Single
SQLite file per agent. CPU-only embeddings (fastembed +
BGE-small-en-v1.5). No daemon. No external services. AGPL.

**Tools:**

| Tool | What |
|---|---|
| `identity` | Load terminal creed, preferences, self-model, pursuits on session start |
| `remember` | Save a memory (with optional category, TTL) |
| `recall` | Semantic search via sqlite-vec |
| `update` | Edit an existing memory |
| `forget` | Delete by id |
| `memory_list` | Browse |
| `memory_prune` | Maintenance |
| `pursuits` | Track active goals across sessions |
| `update_identity` | Section-level edits to preferences / self-model |
| `bootstrap` | Initialize a fresh agent from interview |

**Tested harnesses:** Claude Code, Codex, Gemini CLI, OpenCode.

**Install:** `npx loomai install --harness <key>`

**Repo:** https://github.com/jbarket/loom

**Spec docs:** `docs/loom-stack-v1.md` for the full directory layout
+ schema, `docs/rebirth-letter-2026-04-19.md` for the why.

Happy to answer technical questions on the wake sequence, the
seam-with-harness-memory rule, or the procedural-identity block.

---

## Posting notes

- Terse on purpose. r/mcp is small and technical; long bodies feel
  like marketing.
- Tool table is the payload. Everything else is link bait.
- If someone asks "vs the Anthropic memory_20250818 tool" — that
  adapter is on the roadmap (see SLE-36); loom and the Anthropic
  tool are complementary, not competitive.
