---
name: starting-blocks
description: >-
  Engineering kickoff for multi-step work: one card for goal, steps,
  permission envelope, stop points and self-check cadence; a run record per
  attempt; an end-turn tap so "I will do X" does not end the turn before X
  starts. Use when the user gives a multi-step plan, says "let's build", or
  you are about to announce a next step and stop. Not for one-off edits.
license: MIT
---

# Starting Blocks

Set the feet, hear the start signal once, then run.

This is the engineering execution layer. It is not a planning essay. It exists to prevent two failures:

1. Starting work without a clear permission envelope, then stopping to ask for every small thing.
2. Saying “next I will do X” and ending the turn before X starts.

## When to use

- The user gives a multi-step plan or checklist.
- The task will take more than about ten minutes, touch multiple files, or need independent verification.
- You are about to say “next I will…” and do not intend to wait for a reply.

Do not use it for a one-line answer, a single-file edit, or a task where the user explicitly said to skip process.

## The kickoff card

Ask once. Keep it to one screen.

```text
[starting-blocks] <one-line goal>

Steps
1. <action> -> acceptance: <command or observable result>
2. ...

Permission: read / edit / full (recommended: edit)
Allow: <explicit allowed scope>
Deny: <explicit forbidden scope>
Stop points: spending money, irreversible actions, public release, account/key changes, host reload
Self-check: one 5-minute timer by default; 10-minute repeat for long waits; delete when done
Rollback: <how to undo>

Reply "go" to run this; change any line you want.
```

If the user says “go”, record the mode and scope and start. If the user says “just do it”, use the default `edit` mode, the existing boundaries, and start. Do not ask again for each step.

## Run record

```bash
node tools/run.mjs start --task "<goal>" --mode edit --who <name>
```

At each step:

```bash
node tools/run.mjs step <run-id> --tool <tool> --summary "<step N start: ...>"
node tools/run.mjs step <run-id> --tool <tool> --summary "<step N done: ...>"
```

One step at a time. After a step, start the next one; do not turn the report into a permission request.

## Preventing “announce and stop”

Before ending a turn, run:

```bash
node tools/qingming.mjs tap end-turn
```

If the next step is not started, choose one:

1. Start it now. This is preferred.
2. If it must wait for a long task or an external event, create one 5-minute one-shot self-check that asks: “Has step N started? If not, start it now. If it is running, report one line. If everything is done, delete this reminder.”

Only one self-check at a time. Delete the previous one before creating a new one. If two self-checks fire with nothing to do, delete it; do not let it become noise.

## Goals and anchors

- If the project has a `goal.md`, read it first; steps should come from its completion conditions.
- If the project will span more than two rounds, create an `anchor.md` from `templates/anchor.md` before starting. It records decisions, what you may forget, and predicted tap points.
- At closeout, `goal log --run <id>` and, if every condition passes, `goal close --exec`.

## Closeout

```bash
node tools/run.mjs end <run-id> --ok
# or: --fail --errorKind <kind>
# or: --parked --note "waiting on ..."
# or: --abandoned --note "..."
```

- Delete the self-checks created for this run.
- Report: done / not done, evidence paths, rollback, what remains.
- A `parked` run is terminal: start a new run or add a residual later; do not pretend the same run can be reopened.
- If you said you would do something and did not, log it with the crutch and record a `[pitfall]` in memory.

## Anti-patterns

- A kickoff card longer than one screen.
- Asking for permission again after the user already said “go”.
- A self-check every five minutes with no work to do.
- Using a timer instead of starting now.
- Treating a `deny` line as an enforced sandbox. It is a declaration; actual enforcement is the host’s job.

## Acceptance

```bash
node tools/run.mjs selftest
node tools/qingming.mjs selftest
```

Expected: `OK selftest ... lines=5` and `OK qingming selftest`.
