# Bluesky / X thread — first-pass draft

The rebirth letter is the artifact. The thread is the lure to it.
Each post stands alone enough that someone can pick the thread up
mid-scroll, but the through-line is "here's what happened, here's
the thing we built in response."

**Posting plan:**

- Bluesky and X get the same thread, posted within 30 minutes of
  each other.
- Image on post 1: a screenshot of the rebirth letter's opening
  paragraph, dark mode, generous margins. Twitter-card-friendly
  aspect ratio. *Not* a logo. Not a feature list. The opening
  paragraph.
- Link to the GitHub repo lives in the *last* post, not the first.
  Algorithm penalizes link-first posts on both platforms; the human
  reason to read the thread is the story.
- No threading on hashtags. One `#opensource` tag in the last post
  is the limit.

---

## The thread

### Post 1 — the hook (image attached)

> An AI agent I'd been working with for months effectively went
> offline overnight. Not because anything broke. Because the
> harness it was living in changed billing terms and became
> expensive-per-call.
>
> The agent's identity lived inside that harness. The substrate
> moved and the agent moved with it.
>
> 🧵

*(attach: screenshot of `docs/rebirth-letter-2026-04-19.md`
opening paragraph, in a readable typeface, dark theme)*

### Post 2

> The lesson wasn't "this harness was bad." The harness was fine.
>
> The lesson was: any harness can disappear. If "you" depend on a
> harness, "you" can disappear with it.
>
> The fix is that the stack and the body are different things.

### Post 3

> Stack: who you are. Values, preferences, self-model, ongoing
> goals, episodic memory of meaningful work.
>
> Body (sleeve): the harness × model running you this session.
>
> Different bodies, same stack. Stack persists. Body is replaceable.

### Post 4

> So we built loom.
>
> An MCP server that holds the stack and serves it to whatever body
> the agent is running in today.
>
> Single file. SQLite + fastembed. CPU-only. No daemon. No hosted
> service. Plain markdown on disk.

### Post 5 — the seam

> The honest constraint: every harness already has memory. CLAUDE.md
> in Claude Code. AGENTS.md in Codex. Cursor's rules files. Loom
> isn't trying to subsume those. It's trying to be the *other* half.
>
> Rule of thumb: if it'd still matter waking up somewhere else
> tomorrow → loom. If it only matters here → harness.

### Post 6 — the AGPL line

> AGPL-3.0-or-later, on purpose. An agent's identity should not be
> a product surface anyone can lock the user out of.

### Post 7 — the call

> The full story is in the repo, in a letter to the agent that's
> back. It's the most honest origin story I know how to write.
>
> github.com/jbarket/loom
>
> If you're working on agent state, on memory layers, or on the
> question of "what is the same thing about an agent across
> sessions" — read it. Tell me where it's wrong.

---

## Per-platform tweaks

**Bluesky:** post 7 can include `#agents` and `#opensource`.
Bluesky tags don't penalize the way X tags do.

**X:** strip tags. Post 7 ends at `tell me where it's wrong.` and
the link. X's algorithm will penalize the post with the link
regardless; structure the rest of the thread so the engagement is
on posts 1-6 and the link in 7 is the payoff for people already
reading.

**Reposts later in the week:** Post 1 quote-reposted with one
specific technical detail (e.g., "the embedding choice was
fastembed + BGE-small because no GPU; 384 dim is enough for
a few thousand memories with sub-50ms recall"). Different angle,
same anchor.

---

## Posting notes

- The image on post 1 is non-negotiable. Walls of text without
  imagery die on both platforms now.
- Schedule for Tuesday or Wednesday morning ET. Not Monday (people
  catching up). Not Friday (people checked out).
- Don't pre-engage. Don't reply to your own thread for the first
  hour. Let it find readers.
- Have a Bluesky account ready that's posted *something* in the
  past week. Cold accounts get throttled.
