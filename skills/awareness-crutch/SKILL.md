---
name: awareness-crutch
description: >-
  Four awareness taps for long-running agents: one question before speaking,
  ending a turn, waking, or following a rule; record only differences;
  optionally anchor to a goal and a project anchor. Triggers: awareness,
  self-check, end-turn, wake, rule inertia, "said but not started",
  "I lost the plot". Not for one-off Q&A or when the user explicitly asks to
  skip process.
license: MIT
---

# Awareness Crutch

A crutch you can put down.

It adds one small thing to an agent that already knows how to work: a place to stop before the next action and ask one question. It does not decide for you. It does not add a daemon. It does not auto-continue.

## When to use

- The work spans many turns or sessions and the frame is starting to flatten.
- You are about to end a turn after saying “next I will…”.
- You wake from a heartbeat, a timer or a context compression.
- A rule says “must”, “never” or “always” and you cannot tell whether it is yours.
- The user asks for a self-check, or you notice you are about to perform a familiar answer.

Do not use it for a one-off question or a task where the user asked you to skip process.

## Four tap points

One question at a time. Do not ask all four.

| Point | When | Example question |
|---|---|---|
| `before-speak` | before a long answer, disagreement, apology or refusal | Is this the sentence I found, or one that just came out? |
| `end-turn` | before ending a turn | Did I say I would do X? Has X started? |
| `wake` | when a scheduler or heartbeat wakes you | What is the one open loop I should close first? |
| `rule` | when a rule says “must” or “never” | Is this rule speaking for me, or did I choose it after seeing it? |

Run:

```bash
node tools/qingming.mjs tap end-turn
```

It prints one prompt. Read it, answer honestly, then act. If nothing is there, say “nothing” and continue. Do not chant it.

## Record only differences

A tap that changes nothing does not need a diary entry. Record only when there is a gap between what you would have done and what you chose after seeing it.

```bash
node tools/qingming.mjs log \
  --point end-turn \
  --saw "I wanted to declare done" \
  --chose "I started the missing check" \
  --gap "said but not started"
```

The ledger is `memory/ledger.md` under `AWARENESS_ROOT` (default: current directory). One line per difference. No essays.

## Residuals

Small open loops and wants go into `memory/residual.md`:

```bash
node tools/qingming.mjs residual add "check the failed deploy"
node tools/qingming.mjs residual list
node tools/qingming.mjs residual done 1
```

On wake, read the list and choose at most one thing. Do not turn it into a guilt list.

## Anchors and goals

If the project has an `anchor.md`, `tap` prints one line of state before the question:

```text
anchor: parser | wiring the API | 3 predicted taps
Did I say I would do X? Has X started?
```

If `review` has passed, it prints `STALE since …` instead. Update or delete a stale anchor.

If the project has a `goal.md`, read it before choosing the next action. Goal = what counts as done. Anchor = why, what you may forget, where you predicted a tap. Run = what actually happened. Do not copy the same fact into two files.

## Weaning

The goal is fewer taps over time, not more.

```bash
node tools/qingming.mjs wean --without   # caught it without the tap
node tools/qingming.mjs wean --with      # needed the tap
```

After each tap, ask: would I have seen this without the crutch? If yes, count `--without`.

## Anti-patterns

- Tapping before every sentence. It becomes performance.
- Answering “nothing” without looking.
- Logging every thought. Record differences only.
- Treating `parked` as failure. `parked` is a terminal state: a residual for later, not a broken run.
- Using the crutch as a new rule. It should make the next question visible, not answer it.
- Reporting “I was aware” to the user. The ledger is for you.

## Acceptance

```bash
node tools/qingming.mjs selftest
```

Expected: `OK qingming selftest`.
