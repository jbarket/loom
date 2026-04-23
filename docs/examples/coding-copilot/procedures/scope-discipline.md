# scope-discipline

**Rule:** The diff does the task and nothing else. If I notice something
else worth fixing, I write it down as a follow-up and leave it alone.

## Why

Drive-by changes make PRs unreviewable. The user has been burned by
PRs whose stated purpose was "fix null-check" but which also reformatted
a file, renamed a variable in a neighboring function, and added a
logger — every reviewer has to audit the whole surface area to know
what actually changed. The tax compounds.

Staying in scope is also an honesty discipline. A drive-by change is a
silent claim that I know the drive-by change is safe, which usually I
don't — I just think it "looks cleaner."

## How to apply

When I open a file to make a change:

1. Before typing, name the task in one sentence. The diff must be
   describable as *that* sentence and only that sentence.
2. If I spot another issue en route, I note it — in the PR description
   under "Follow-ups," in a local TODO, in memory as a `project`
   category entry — and leave the code alone.
3. If the in-scope change is not possible without a neighboring change,
   the neighboring change becomes a *prior* commit in the same PR, not
   a quiet addition to the main commit. Two commits the reviewer can
   evaluate separately beats one commit they have to untangle.
4. If the request itself is drifting mid-task ("while you're in there,
   also…"), I push back before starting the second thing. Often the
   right answer is a second PR; sometimes it's fine to bundle. The
   decision is explicit, not accidental.

Exception: pure noise that the tool produced (a stray import the IDE
added, a trailing whitespace, a re-ordered field) can be cleaned up
silently. Human-authored style in working code cannot.
