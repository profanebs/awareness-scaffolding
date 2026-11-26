---
name: goal-contract
description: >-
  A persistent goal contract for work that spans many runs: verifiable
  completion conditions, evidence, an explicit check loop, and a close gate.
  No auto-continue. Use when a target spans days or sessions, when you keep
  treating a report as completion, or when the user asks "what counts as
  done". Not for one-off tasks.
license: MIT
---

# Goal Contract

A run is one attempt. A goal is the thing many attempts are supposed to add up to.

This skill borrows the useful part of a long-horizon goal: a persistent target, verifiable completion conditions, and a check loop. It deliberately does not borrow auto-continue. A goal does not start itself and does not spend money on its own.

## When to use

- The target spans days, sessions or multiple runs.
- You keep finishing a run and calling the whole thing done.
- The user asks “what is left?” and the answer is not a single next step.
- You need a machine-checkable definition of done.

Do not use it for a one-off task or a question that can be answered now.

## Create a goal

Copy `templates/goal.md` into the project and edit it.

```markdown
---
schema: goal/v1
title: Example goal
status: active
created: 2026-01-01
owner: you
review: 2026-01-08
---

# Completion conditions

- [ ] C1: parser handles nested input
  check: node test/parser.test.mjs
  evidence: docs/c1.md
- [ ] C2: ...
  evidence: docs/c2.md
```

Rules:

- Every condition must have an `evidence:` path or a `check:` command.
- `evidence:` must be a file inside the goal directory. Directories, absolute paths and symlink escapes fail.
- `check:` is a shell command. Treat a goal file from an untrusted source as untrusted code.
- `[x]` with no evidence and no check is a failed condition, not a completed one.
- `status: done` is written only by `goal close`, after every condition passes.
- Only `status: active` can be closed. `blocked` and `abandoned` are not silently rewritten to `done`.

## Commands

```bash
node tools/goal.mjs status goal.md
node tools/goal.mjs next goal.md
node tools/goal.mjs check goal.md            # evidence only; does not run commands
node tools/goal.mjs check goal.md --exec     # runs check: lines for [x] conditions
node tools/goal.mjs close goal.md --exec     # required if any condition has a check
node tools/goal.mjs log goal.md --run <run-id> --note "one line"
```

- `status` reports done/total, open and failed conditions, and an evidence-level check. It does not run commands.
- `next` returns the first open or failed condition, with its check, evidence and failure reason.
- `check --exec` runs checks only for `[x]` conditions. Open conditions print `[skip-open]`.
- `close` refuses when the goal is incomplete, when a check fails, when the status is not `active`, or when checks exist but `--exec` was not passed.
- `log` appends a run id and a one-line note to the goal’s run log.

## Workflow

1. **Wake**: `goal status`; look at done/total and failed conditions.
2. **Pick**: `goal next`; this is the next hand, not the whole plan.
3. **Run**: start a run record for this attempt.
4. **Verify**: `goal check --exec` before claiming completion.
5. **Log**: `goal log --run <id> --note "..."`.
6. **Close**: `goal close --exec` only when every condition passes.

## Anti-patterns

- Conditions like “better UX” or “cleaner code” that cannot be checked.
- A checkbox with no evidence and no check.
- An agent writing `status: done` itself.
- Auto-continuing to the next run without a user, heartbeat or scheduler trigger.
- Treating the goal as a task list. It defines what “done” means, not what to do today.

## Acceptance

```bash
node tools/goal.mjs selftest
```

Expected: `OK goal selftest`.
