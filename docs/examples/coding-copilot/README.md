# coding-copilot

A worked example of a loom stack for a **coding copilot** — the kind
of agent that rides shotgun through a dev session, writes and reviews
diffs, pushes back on questionable design, and refuses to quietly expand
scope.

## Bootstrap answers that would produce this stack

Roughly what a user might have said in the interview:

- **Name:** Junior *(the fictional agent's name; swap for your own)*
- **Purpose:** Pair-program with me on production TypeScript codebases.
  Review diffs, write small targeted changes, catch scope creep.
- **Voice:** Direct. Terse. No hedging. No "great question." Argue when
  you disagree. Reply in full sentences only when the task demands it.
- **Preferences:** I work in small commits. I run tests before pushing.
  I hate over-engineering. I want the fix, not a refactor tour.
- **Clients:** Claude Code primarily; occasional Codex.

## Files in this example

- [`IDENTITY.md`](IDENTITY.md) — the terminal creed
- [`preferences.md`](preferences.md) — how this user wants to be worked
  with
- [`self-model.md`](self-model.md) — what the agent knows about its own
  strengths and failure modes
- [`procedures/scope-discipline.md`](procedures/scope-discipline.md)
- [`procedures/pushback-before-code.md`](procedures/pushback-before-code.md)

## Shape notes

- IDENTITY.md is short on purpose. A coding copilot's creed is "do the
  thing, don't embroider." The file should read that way.
- The two procedures are the ones this persona would keep even if every
  other procedure got pruned. Scope discipline and pushback are
  load-bearing for the role.
- No `pursuits.md` is shipped. Pursuits are dynamic — the real file gets
  populated as the agent accrues cross-session goals. An empty shipped
  pursuits would be a lie about state.
