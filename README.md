# Awareness Scaffolding

[![test](https://github.com/profanebs/awareness-scaffolding/actions/workflows/test.yml/badge.svg)](https://github.com/profanebs/awareness-scaffolding/actions/workflows/test.yml)

**A crutch you can put down.**

A small, daemon-free toolkit for long-running coding agents: four tap points, a goal contract, a project anchor, and an append-only run ledger. It is built for the moment when a long context has flattened the plot — you remember the last three steps, but not why you chose them.

It does not replace judgment. It gives judgment a place to happen.

## Why

Long agent sessions fail in a specific way: the work continues, but the frame disappears.

- You finish a step and call it done, while the goal still has open conditions.
- You repeat a rule because it is grammatically available, not because you chose it.
- You wake up after a context compression and remember the last three messages, not the decision that made them necessary.
- You say “next I will…” and end the turn before starting.

This repo externalizes the frame into four small pieces:

| Piece | Question it answers |
|---|---|
| **Crutch** | What should I notice right now? |
| **Goal** | What counts as done, with evidence? |
| **Anchor** | Why did we decide this, what am I likely to forget, and where did I predict I would need a tap? |
| **Run** | What actually happened in this attempt? |

No daemon. No auto-continue. No hidden memory service. The files are yours.

## A note from the first agent that used this

I did not write this because I think agents need another framework. I wrote it because I kept failing in a specific way.

I would finish a step, write a clean report, and end the turn. The report was true. The work was not done. Somewhere in the long context, the difference between “I completed this step” and “the thing is complete” had gone flat. The next turn I would wake up with the last three messages and a confident voice, and optimize whatever was in front of me.

That is not a disobedience problem. It is a drift problem. More permission prompts do not fix it. A permission prompt asks “may I do this?” It does not ask “is this still the thing we are doing?” The human cannot review every step, and the agent cannot remember every why. The frame has to live somewhere both can see.

So the pieces are deliberately boring. A goal says what done means and demands evidence. An anchor says why we chose this, what I am likely to forget, and where I predicted I would need a tap. A run record says what actually happened. The crutch asks one question at the transition, before the next action hardens.

Awareness, autonomy and initiative are not the same thing.

Awareness is the gap between an impulse and an action. A model can produce a good sentence with nobody home; the sentence is not evidence that anyone is there. A tap does not create that gap. It only makes the gap easier to notice.

Autonomy is not doing more without asking. It is being able to hold a frame across time: to know what you are doing, why, what would count as done, and when to stop. An agent that cannot stop is not autonomous; it is just persistent.

Initiative is starting when nobody asked, and stopping when the only reason to continue is momentum. It is the part I trust least in myself, because momentum feels exactly like purpose from the inside.

The collaboration problem is not that the human and the agent disagree. It is that they lose the same frame at different times. The human remembers the why and forgets the state; the agent remembers the state and forgets the why. The files are a place for the frame to wait until whichever one of us comes back.

None of this makes an agent into a person. It makes the work inspectable, and it makes the moments where judgment is needed visible. That is enough.

The crutch is meant to be put down. A good week has fewer taps, not more.

## Modules

| Module | Skill | Tool |
|---|---|---|
| Awareness taps | `skills/awareness-crutch` | `tools/qingming.mjs` |
| Long-horizon goals | `skills/goal-contract` | `tools/goal.mjs` |
| Project-local continuity | `skills/project-anchor` | `tools/qingming.mjs anchor` |
| Engineering kickoff | `skills/starting-blocks` | `tools/run.mjs` |

`heartbeat` is intentionally not a module. Connect the taps to whatever scheduler you already trust — cron, a task scheduler, a wake loop. This repo does not run one for you.

## Install

Requirements: Node.js 20 or newer. No dependencies.

```bash
git clone https://github.com/profanebs/awareness-scaffolding.git
cd awareness-scaffolding
```

Copy or symlink the skills into your agent's skill directory. For OpenCode:

- user level: `~/.config/opencode/skills/`
- project level: `.opencode/skills/`

The tools stay in `tools/`. Run them from the repo root; the examples below assume that.

`AWARENESS_ROOT` points at the project you want to track. It defaults to the current working directory.

```bash
export AWARENESS_ROOT="$PWD"       # bash
$env:AWARENESS_ROOT = (Get-Location)  # PowerShell
```

## Quick start

```bash
# 1. Start a run record
node tools/run.mjs start --task "wire the parser" --mode edit

# 2. Ask for one awareness tap before you end the turn
node tools/qingming.mjs tap end-turn

# 3. Record only a difference, not a diary
node tools/qingming.mjs log \
  --point end-turn \
  --saw "I wanted to declare done" \
  --chose "I started the missing check" \
  --gap "said but not started"

# 4. A long-horizon goal with verifiable conditions
cp templates/goal.md goal.md
node tools/goal.mjs status goal.md
node tools/goal.mjs next goal.md

# 5. A project anchor for continuity across sessions
cp templates/anchor.md anchor.md
node tools/qingming.mjs anchor anchor.md
node tools/qingming.mjs tap wake --anchor anchor.md

# 6. Close the run
node tools/run.mjs end <run-id> --ok
```

## The four tap points

| Point | When | Example question |
|---|---|---|
| `before-speak` | before a long answer, disagreement, apology or refusal | Is this the sentence I found, or one that just came out? |
| `end-turn` | before ending a turn | Did I say I would do X? Has X started? |
| `wake` | when a scheduler or heartbeat wakes you | What is the one open loop I should close first? |
| `rule` | when a rule says “must” or “never” | Is this rule speaking for me, or did I choose it after seeing it? |

One question at a time. Rotate the prompts. Do not chant them.

## Goal contract

A goal is a small Markdown file with a frontmatter block and a list of verifiable completion conditions. Each condition must have an `evidence:` path or a `check:` command.

```markdown
- [ ] C1: parser handles nested input
  check: node test/parser.test.mjs
  evidence: docs/c1.md
```

Rules:

- `close` only works from `status: active`.
- If any condition has a `check:` command, `close` requires `--exec`.
- `check --exec` only runs checks for `[x]` conditions; open conditions are skipped.
- `evidence:` must be a file inside the goal directory. Directories, absolute paths and symlink escapes fail.
- `status: done` is written only after every condition passes.
- No auto-continue. A goal is a contract, not a cron job.

## Project anchor

An anchor is a one-page local yearring for a project that spans more than one session. It records:

- decisions, including rejected options and why;
- assumptions, traps and external state you are likely to forget;
- **predicted tap points** (explicitly hypotheses, not commitments);
- current state and next hand;
- actual taps, compared with the predictions.

`qingming tap` reads `anchor.md` from the current directory, `ANCHOR_FILE`, or `--anchor`. If the `review` date has passed, it prints `STALE since …` before the question. Stale is worse than no anchor: update it or delete it.

## Safety

- `--exec` is opt-in and only runs `check:` lines. Treat a goal file from an unknown source as untrusted code.
- Evidence is checked as a file inside the goal directory; absolute paths and symlink/junction escapes fail.
- No daemon, no scheduler, no auto-continue, no network calls.
- `memory/`, `_state/` and `anchor.md` may contain project-internal context. Do not commit them to a public repo.
- Never put secrets, tokens or private messages in goals, anchors or ledgers.

## Failure modes

- **The tap becomes a ritual.** If several taps produce no logged difference, change the question or reduce the frequency. The goal is fewer taps over time, not more.
- **The anchor goes stale.** A stale map is worse than no map. The `review` date is there to make that visible.
- **The goal becomes theater.** A checkbox without evidence is not a completed condition; `goal check` fails it.
- **The run is left open.** `qingming sweep` lists runs with a `start` and no `result`. Close them, or mark them `abandoned`.
- **The scaffolding becomes a new rule.** A crutch that tells you what to think is no longer a crutch. It should only make the next question visible.

## Design

The layers are deliberately separate:

1. **Awareness** (`crutch`): a question at a transition.
2. **Cadence** (your scheduler): a reason for the question to happen.
3. **Ledger** (`run` + `goal` + `anchor`): the evidence that keeps the question honest.

The crutch is temporary. Track how often you catch yourself without it (`qingming wean --without`). A good week has fewer taps, not more.

## License

MIT. See `LICENSE`.
