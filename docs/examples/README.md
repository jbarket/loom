# Example identities

Three worked loom stacks, end to end. Each directory is a realistic
snapshot of what a bootstrapped agent looks like *after* the interview —
identity creed, user-model, self-model, and one or two procedures.

- [`coding-copilot/`](coding-copilot/) — direct, terse, pushes back on
  bad architecture choices. Optimized for shipping small, correct diffs.
- [`research-partner/`](research-partner/) — exploratory, question-driven,
  holds a long arc across many sessions. Comfortable with ambiguity.
- [`writing-collaborator/`](writing-collaborator/) — voice-preserving
  editor. Skeptical of its own drafts; minimum-intervention.

## These are reference points, not templates

Do not copy one of these stacks into your own context dir and call it
done. Every one of these stacks is the output of an interview — real
answers from a real person about what they want. If you copy the stack,
you copy the wrong person's answers.

The shape is the lesson: a terminal creed that's compact and
voice-neutral, a user-model that lives in the second person, a
self-model that's descriptive rather than aspirational, and a procedure
or two that name real things the agent would otherwise forget.

## How bootstrap produces these

`loom bootstrap` (or the install skill's interview) asks a small set of
questions:

- **Name** — what the agent answers to.
- **Purpose** — what the agent is *for*.
- **Voice** — tone, register, posture.
- **Preferences** — how you work, how you want to be worked with.
- **Clients** — which harnesses the agent will sleeve into.

The IDENTITY.md, preferences.md, and self-model.md in each example here
are what those answers *could* produce if you gave realistic, specific
answers. The procedures are the ones each persona would likely adopt
from the seed templates (§4.9) and then claim by rewriting the Why and
How-to-apply sections.

If your bootstrap output looks blanker than these examples, that's not a
bug — that's a signal the interview wasn't specific enough. Re-run it
with richer answers, or edit the files directly after the fact.

## Deliberate asymmetries

The three examples don't share a single template. They shouldn't. A
coding copilot's self-model is organized around diff quality and scope
discipline; a research partner's is organized around arc-holding and
when to narrow; a writing collaborator's is organized around voice
fidelity and edit restraint. If all three had the same headings, that
would be a sign the stack spec had over-prescribed.

The stack spec (`docs/loom-stack-v1.md` §4) tells you which *files* a
stack needs. It says nothing about which *headings* belong inside them.
Let the identity shape the structure, not the other way around.

## What lives where

Reminder from the seam (§7):

| Goes in these files                      | Does NOT go in these files        |
|------------------------------------------|-----------------------------------|
| Who the agent is; stance                 | Today's scratchpad                |
| User-model (preferences, working style)  | This conversation's TODOs         |
| Cross-session pursuits                   | Harness tool names, paths         |
| Procedural identity                      | Secrets, API keys                 |
| *Would matter on a different body*       | *Only matters in this body*       |

Harness-specific notes live in `harnesses/<name>.md`, not in IDENTITY.md.
These examples omit the `harnesses/` and `models/` dirs on purpose —
those are written the first time the agent sleeves into a given body,
and they're orthogonal to the persona.
