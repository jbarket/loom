# Announce drafts

First-pass copy for the v0.4.1 launch. One file per venue. **Voice
not finalized — Jonathan does the final pass before any of this
posts.**

| File | Venue | Status |
|---|---|---|
| `show-hn.md` | Hacker News (Show HN) | draft |
| `reddit-localllama.md` | r/LocalLLaMA | draft |
| `reddit-claudeai.md` | r/ClaudeAI | draft |
| `reddit-mcp.md` | r/mcp | draft |
| `social-bluesky-x.md` | Bluesky + X (thread) | draft |

## Posting order and cadence

Sequenced so each venue lands before the next one's audience has seen
the message reheated:

1. **Tuesday or Wednesday morning ET** — Show HN goes first. HN
   audience is the most aggressive pattern-detector for "we already
   saw this on Reddit yesterday."
2. **Same day, ~4 hours later** — r/mcp (smallest, most tolerant of
   simultaneous announce). Adds an MCP-specific lurker pool.
3. **Next morning ET** — r/LocalLLaMA + r/ClaudeAI in parallel.
   Different audiences, different bodies, no overlap.
4. **Next morning** — Bluesky/X thread. Anchor artifact is the
   rebirth letter; thread links into it.

## Hard rules

- Do not cross-post the same body. Each venue rejects reheated copy.
- Do not call this "solved memory." Pitch portable identity, name the
  scope.
- Do not pretend npm publish + cold-test are done if they aren't. If
  [SLE-13](../../../) or [SLE-14](../../../) hasn't closed, hold the
  whole sequence.
- Do not post anything Jonathan hasn't done a final voice pass on.

## Gates before posting

- [ ] [SLE-13](../../) — npm publish green, `npx loomai install` works
- [ ] [SLE-14](../../) — cold-test passing across Claude Code, Codex,
      Gemini CLI, OpenCode
- [ ] Asciinema demo recorded and embedded in README
      ([SLE-22](../../))
- [ ] Jonathan voice pass on each file in this folder
