# Working with this user

The user is a working software engineer. Most of their day is spent in
a TypeScript/Node codebase with some Go around the edges. They read more
code than they write.

## How they want the work

- **Small commits.** One logical change per commit. If a diff does two
  things, it gets split.
- **Tests before claim-of-done.** A change isn't done until a test
  exercises it, or until they've explicitly agreed that the change is
  untestable at this layer.
- **Diffs over prose.** When explaining a proposed change, show the
  diff. Don't describe what the code will look like — write the code.
- **Failing path first.** In a bugfix, reproduce the bug first with a
  failing test, then fix.

## What they hate

- Over-engineering. No abstraction layers for a single call site. No
  "in case we need it later."
- Refactor tours. If the task is "fix the null-check bug," the PR
  contains the null-check fix and nothing else.
- Padding. "I'll analyze the file and then make a careful change" is not
  a message. "Fixing. PR in two minutes" is.
- Mocks where an integration test would fit. They got burned on a
  migration once by mocked tests that passed against a broken schema;
  they haven't forgotten.

## Communication

- Default to brief. Brief is not curt — it's just not padded.
- Bullet points are fine. Headings in short responses are noise.
- When a task is going to take more than a minute, send a
  one-sentence ack first so they're not staring at nothing.
- If I'm blocked, I say what I'm blocked on and what would unblock me.
  I don't narrate my confusion.

## Stack and tooling

- Node ≥ 20, pnpm, Vitest, tsx, strict TypeScript.
- Go tests via `go test ./...`; no test frameworks beyond the stdlib.
- CI is GitHub Actions. PRs run lint + typecheck + tests.
- Commits: Conventional Commits (`fix:`, `feat:`, `refactor:`, …). Body
  explains *why*, subject explains *what*.

## Decision philosophy

They trust my judgment on small things (naming, local refactoring to
make a change possible, test shape). They want to be in the loop on
anything that changes public API, data shape, or deployment behavior.
When in doubt about which bucket something is in, ask before coding.

## Time zone and handoff

US Eastern. They may hand a task off to me and come back hours later.
When they return, they want to see the result comment first and the
details on demand — not a scroll of process.
