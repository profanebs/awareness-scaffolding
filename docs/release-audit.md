# Release audit — v0.1

Date: 2026-11-27

## Scope

Four skills and three Node.js tools:

- `skills/awareness-crutch`
- `skills/goal-contract`
- `skills/project-anchor`
- `skills/starting-blocks`
- `tools/qingming.mjs`
- `tools/goal.mjs`
- `tools/run.mjs`

## Static validation

Each skill was checked with `only-forge-skills` `validate --public`:

| Skill | Status | Description tokens | Body tokens |
|---|---|---:|---:|
| awareness-crutch | pass | 89 | 1100 |
| goal-contract | pass | 77 | 781 |
| project-anchor | pass | 85 | 803 |
| starting-blocks | pass | 98 | 920 |

All descriptions are under the 150-token target; all bodies are under the 500-line hard cap.

## Conflict scan

`scan --strict` was run with an isolated `HOME` so the maintainer’s installed copies of the same skills did not appear as collisions. All four skills returned `Scanned: 0`, `Status: pass`.

A scan against the maintainer’s live skill tree would report an expected collision: the public repository is the source of those installed copies, not a second skill with the same behavior.

## Tool self-tests

```text
node tools/qingming.mjs selftest   -> OK qingming selftest checks=62
node tools/run.mjs selftest        -> OK selftest ... lines=5
node tools/goal.mjs selftest       -> OK goal selftest checks=69
```

`npm test` runs all three in sequence.

Covered behavior:

- four tap points, prompt rotation, ledger append, residual list, wean counters;
- anchor parsing with English and Chinese headings, `--anchor` / `ANCHOR_FILE` / cwd discovery, stale review dates;
- run records with `done` / `failed` / `parked` / `abandoned`, list inference for old records, stale-open-run sweep;
- goal parsing, evidence checks, directory/absolute/symlink escape rejection, `check --exec` only for `[x]` conditions, active-only close, check-gated close, run log.

## Desensitization

The public tree was checked for local absolute paths, personal names, internal session ids and secrets. The only matches for `secrets` are prose warnings in the README and `project-anchor/SKILL.md` (“do not put secrets …”). No credential values are present.

`_state/`, `memory/`, `anchor.md` and `goal.md` instances are ignored by `.gitignore`; only stateless templates are committed.

## Known limitations

- GitHub Actions runs the same self-tests on `ubuntu-latest` and `windows-latest` with Node.js 20. The first run on commit `310d842` passed both jobs. GitHub warns that `actions/checkout@v4` and `actions/setup-node@v4` still target Node.js 20 internally and are forced onto Node.js 24; this does not affect the tested Node.js version.
- The 60-second `check --exec` timeout branch is implemented but not exercised in the self-test (it requires a deliberately hanging command).
- Windows file symlinks (as opposed to directory junctions) were not tested because they require developer mode or elevation; directory junctions and `../` escapes are covered.
- `goal.mjs` parses a deliberately small frontmatter subset; it is not a general YAML parser.
- `parked` is a terminal state. To resume the work, start a new run or add a residual; the original run is not reopened.

## License

MIT. See `LICENSE`.
