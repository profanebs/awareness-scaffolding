---
name: project-anchor
description: >-
  A one-page project-local continuity file for multi-session work: decisions,
  things you are likely to forget, predicted tap points, current state. The
  awareness tap reads it before asking a question. Use when a project spans
  more than one session, survives a context compression, or you need to
  remember why a decision was made. Not for one-off tasks.
license: MIT
---

# Project Anchor

A small local yearring for one project.

Across sessions, a long-term memory tells you who you are. An anchor tells you where this project is: what was decided, what you are likely to forget, and where you predicted you would need a tap. It is not a second brain. It is one page.

## When to use

- The project spans more than two sessions or more than one context compression.
- You notice you remember the last three steps but not why they were chosen.
- You are about to hand off to another session, another body or another agent.
- A decision had a rejected alternative that future-you will otherwise re-open.

Do not create one for a one-off task. An empty anchor is worse than no anchor.

## Create an anchor

Copy `templates/anchor.md` into the project as `anchor.md`.

```markdown
---
schema: anchor/v1
project: Example project
status: active
created: 2026-01-01
review: 2026-01-02
---

# One line
What this project should become.

# Decisions
- D1: ... | why: ... | rejected: ... (reason)

# What I am likely to forget
- A1: ... (assumption)
- T1: ... (trap)
- E1: ... (external state: who is running, which port, which version)

# Predicted tap points (hypotheses, not commitments)
- P1: end of phase 2, before wiring the API — I am likely to declare done here
- P2: when the user says “good enough for now” — I am likely to treat stopping as finishing
- P3: first wake after a context compression — I am likely to remember only the last three steps

# Current state / next hand
- Now: ...
- Next: ...

# Actual taps
- 2026-01-01 09:00 | end-turn | actual: ... | did it match P?
```

## How the tap reads it

`qingming tap` looks for:

1. `--anchor <file>`
2. `ANCHOR_FILE` environment variable
3. `anchor.md` in the current directory

If found, it prints one line before the question:

```text
anchor: parser | wiring the API | 3 predicted taps
Did I say I would do X? Has X started?
```

If `review` is in the past, it prints `anchor: STALE since …` instead. A stale map is worse than no map: update it or delete it.

## Rules

- Keep it to one page. If it grows, move detail into the goal or a design doc.
- Decisions include the rejected option and why. That is the part future-you will re-open.
- Predicted tap points are hypotheses. Mark them as predictions; when a real tap happens, append it under `Actual taps` and compare.
- Current state is two lines: where we are, what the next hand is.
- No secrets, tokens, private messages or customer data.
- Do not commit a real anchor to a public repo. The template is public; the content is not.

## Commands

```bash
node tools/qingming.mjs anchor anchor.md
node tools/qingming.mjs anchor anchor.md --json
node tools/qingming.mjs tap end-turn --anchor anchor.md
```

`anchor` is read-only. `tap` never blocks on a missing or broken anchor; it falls back to the plain question.

## Anti-patterns

- Writing an anchor after the project is done. The value is in the predictions and the decisions, not the summary.
- Copying the goal into the anchor. Goal = what counts as done; anchor = why and what you may forget.
- Letting the anchor go stale. The review date exists to make that visible.
- Treating predicted taps as commitments. They are guesses; update them when reality disagrees.

## Acceptance

```bash
node tools/qingming.mjs selftest
```

Expected: `OK qingming selftest`, including the anchor cases.
