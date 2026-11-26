---
schema: goal/v1
title: Example goal
status: active        # active | done | blocked | abandoned
created: 2026-01-01
owner: you
review: 2026-01-08
---

# Goal

One sentence: what this should become.

# Completion conditions

- [ ] C1: first verifiable condition
  check: node test/c1.test.mjs
  evidence: docs/c1.md
- [x] C2: a condition already done
  evidence: docs/c2.md
- [ ] C3: another condition
  evidence: docs/c3.md

# Boundaries

- Budget: at most N sessions; no new paid services.
- Stop: spending money / irreversible actions / public release / account or key changes / host reload.

# Next hand

1. Do C1: add evidence, then run `check --exec`.

# Run log

- run 20260101-000000-0000 | 2026-01-01 09:00 | goal created
