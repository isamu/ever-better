# MVP: diagnose / bootstrap / freeze

Design note for the first release of `ever-better`. Written 2026-08-08.

## What this tool is

Take an existing repository that has little or no quality tooling, and walk it to a state where
code quality can **only go up**. Not a linter, not a formatter — the thing that installs them,
records where you started, and makes backsliding fail CI.

The full journey is six phases. This document covers P0–P2; P3–P5 are designed here only so the
artifacts P0–P2 produce are the right shape for them.

| Phase | Name | What happens | Who does it |
| --- | --- | --- | --- |
| P0 | diagnose | Survey the repo. What tooling exists, what is missing, how far from the target. | CLI |
| P1 | bootstrap | Install what is missing. Generate configs. Nothing is enforced yet. | CLI |
| P2 | freeze | Pin the current violation counts as a baseline. From here counts may only fall. | CLI |
| P3 | drain | Work one rule at a time: fix, find the bug it exposed, extract a pure function, add the test. | Skill |
| P4 | tighten | Add the next tier of rules (sonarjs, security, type-aware) and repeat P2–P3. | Skill + CLI |
| P5 | split & DRY | Use `max-lines` and jscpd output to break up files and remove duplication. | Skill |
| P6 | review | Multi-OS CI, AI cross-review, bot triage. | Existing skills |

## The one design rule

**The CLI does what is deterministic. The skill does what needs judgment.**

| CLI (`ever-better`) | Skill (Claude Code) |
| --- | --- |
| detect package manager, TS/JS, existing tooling | decide whether a warning is a real bug |
| install devDependencies | decide how to split a function into pure parts |
| generate config files | write the test that pins the bug |
| count violations per rule | decide DRY vs. coincidental similarity |
| render and update `QUALITY.md` | decide what deserves a GitHub issue |
| fail CI when a counter regresses | decide which rule to drain next |

Anything an LLM would do slowly, inconsistently, or differently on each run belongs in the CLI.
Anything a markdown checklist cannot express belongs in the skill. When in doubt, ask which side
would still be correct if it ran a hundred times unattended.

## Why the ratchet is not ours to invent

ESLint ships bulk suppressions in core. `eslint --suppress-all` writes `eslint-suppressions.json`
recording, per file and per rule, how many violations exist right now. Later runs report a **new**
violation as an error while the recorded ones stay silent, and `--prune-suppressions` reclaims the
ones you fixed. That is the whole ratchet, maintained by the ESLint team.

So P2 is a thin wrapper: run the suppress, record the counts we care about in our own state file
(ESLint's file is per-file and noisy), and render the human view.

The three third-party ratchets — `betterer`, `eslint-seatbelt`, `eslint-formatter-ratchet` — all
predate this and were last published over a year ago. Do not depend on them, and do not reimplement
what `--suppress-all` already does.

What ESLint's file does **not** cover, and our state file therefore must: knip's unused-export
count, jscpd's duplication percentage, the number of files over the size limit, and test count.
Those get plain integer baselines with the same "may only fall" rule.

## Artifacts

Two files, written into the target repository and committed by its owner.

**`QUALITY.md`** — the human view and the agent's worklist. Rendered from state, never hand-edited
(edits are lost on the next render; the free-text sections are delimited so they survive).

**`.ever-better/state.json`** — machine state. Baselines, current counts, per-rule status
(`off` / `draining` / `enforced`), phase, and the timestamp of each transition.

`eslint-suppressions.json` is ESLint's, not ours. We invoke it; we never parse or write it.

## Commands

```
ever-better diagnose        survey; write state.json + QUALITY.md; print the report
ever-better bootstrap       install missing tooling, generate configs (idempotent)
ever-better freeze          suppress-all, record baselines, render QUALITY.md
ever-better check           CI gate: fail if any baseline regressed
ever-better status          print the current QUALITY.md summary
```

`diagnose` is read-only and safe to run anywhere. `bootstrap` writes; it refuses to overwrite an
existing config without `--force`. Every command takes `--cwd` and `--json`.

## Detection matrix (P0)

| Signal | How | Why it matters |
| --- | --- | --- |
| package manager | lockfile name; `packageManager` field | every install command downstream |
| TypeScript | `tsconfig.json`; ratio of `.ts` to `.js` under source dirs | selects the JS→TS migration phase |
| ESLint | `eslint.config.*` vs `.eslintrc*`; installed version | flat config is required; legacy needs migrating first |
| Prettier | config file or `prettier` dep | formatting must land before linting, or the first drain PR is unreadable |
| test runner | vitest / jest / node:test / none | P3 cannot start without one |
| knip, jscpd | deps or config files | P5 inputs |
| CI | `.github/workflows/*` steps and OS matrix | P6 input; also tells us whether `check` will ever run |
| agent instructions | `CLAUDE.md` / `AGENTS.md` | P3 quality depends on the repo's rules being written down |
| size distribution | line counts per source file | the `max-lines` backlog, known before any rule is enabled |
| violation counts | `eslint --format json`, per rule | the baseline itself |

Detection must never throw on a repo missing everything — that is the normal input. Absent means
absent, not an error.

## Tier model for the generated ESLint config (P1)

Four tiers, generated as one commented file the user owns. Later phases enable later tiers; P1 only
writes tier 1 and leaves the rest present-but-commented with a line saying which phase turns it on.

1. **base** — `@eslint/js` recommended, `typescript-eslint` recommended, unused vars, prettier compat.
2. **limits** — `max-lines` 600, `max-lines-per-function` 60, `complexity` 20, `max-depth` 4,
   `max-nested-callbacks` 4. Sizes are the defaults from the reference implementation; the generator
   reads the repo's actual distribution and says in a comment how many files currently exceed each.
3. **sonarjs** — `eslint-plugin-sonarjs` recommended, cognitive-complexity 15.
4. **typed** — type-aware rules (`no-floating-promises`, the `no-unsafe-*` family, typed sonarjs).
   Needs `projectService`; the slowest tier, and the one that finds real bugs.

`eslint-plugin-security` sits alongside as an optional tier for repos that touch the filesystem,
child processes, or user input.

## Pinned versions

TypeScript `^6.0.3`, not 7. `typescript-eslint@8` declares support for `typescript <6.1.0`, so TS 7
breaks the linter that this whole tool exists to configure. Node 24 strips types natively, so no
`ts-node` / `tsx` is needed here — but the typescript-eslint ceiling is the binding constraint, not
the runtime.

ESLint `^10`, `typescript-eslint` `^8.66`, `eslint-plugin-sonarjs` `^4.2`.

## Out of scope for the MVP

P3–P6 skills. Non-JS ecosystems. Monorepo-aware per-package baselines (single baseline per repo for
now; the state file's shape leaves room). Automatic JS→TS conversion — P1 detects the need and the
skill drives it, but the CLI does not rewrite source.
