# `ever-better report` — where the findings are

Issue: #49. Adapted from receptron/mulmoterminal#1647.

## What is missing, traced rather than assumed

`eslint .` names files. `ever-better status` gives per-rule totals. `ever-better next` ranks what to
take first. None of them says **where the debt lives** — which areas of the repo carry which rules.

Two populations exist here, and only one of them is mapped at all:

| | recorded where | per rule | per file |
| --- | --- | --- | --- |
| suppressed (the backlog) | `eslint-suppressions.json`, `state.rules` | yes | yes |
| **warnings** | one grand total in `state.counters` | **no** | **no** |
| errors | nothing — they fail the build | no | no |

The warning population is the one that matters most and is the one nobody can see. ESLint's
suppressions cover **errors only**, so a warning is never grandfathered and never drains — it is
permanently visible, ratcheted by ever-better's own counter, and today that counter is a single
number with no breakdown behind it.

## Where the area dimension comes from

`formatters/rule-counts.js` already aggregates inside the formatter, for a stated reason: `--format
json` grows with the number of violations and the first run on an untouched repo is when it is
largest. The same argument applies to the area breakdown, so it is computed in the same place and
what crosses the process boundary stays bounded by rules × areas.

Verified against ESLint 10.8.1 rather than read from docs — a probe formatter reports
`context` keys `["cwd", "rulesMeta"]`, an absolute `result.filePath`, and a real
`suppressedMessages` array. So the area is `path.relative(context.cwd, filePath)`'s first segment,
and a file at the root is `(root)`.

**The formatter is on the critical path of `freeze`, `prune` and `check`, and had no test at all.**
The change is additive — one new key — but it gets tests first, driven directly as the pure function
it is.

## Shape

- `ever-better report` — markdown to stdout, and appended to `$GITHUB_STEP_SUMMARY` when that is set,
  which is what makes it a CI report without any workflow edit by the user
- the generated gate workflow gains a step that calls it, with `if: always()` so the report still
  arrives when `check` has just failed — which is the run where it is most wanted
- degrades to the suppressions file alone when ESLint cannot run, rather than failing

## Files

| File | What |
| --- | --- |
| `formatters/rule-counts.js` | add `areas`, bounded by rules × areas |
| `src/eslintRunner.ts` | the `RuleCounts` type and its guard |
| `src/lintReport.ts` | new, pure — totals, the rule × area matrix, the areas carrying the most |
| `src/render/lintReport.ts` | new, pure — markdown |
| `src/commands/report.ts` | new — run, build, render, append to the step summary |
| `src/cli.ts` | the command |
| `src/generate/gateWorkflow.ts` | the CI step |
| `test/test_ruleCountsFormatter.ts` | new — the formatter had none |
| `test/test_lintReport.ts` | new |
| `test/test_render.ts` | the gate workflow step |

## Decisions worth disagreeing with

- **The report is not a gate.** It never changes an exit code. `check` is the gate and stays the only
  one; a report that can fail a build is a second gate nobody asked for.
- **Errors get totals, not a matrix.** After a freeze an unsuppressed error is new by definition, so
  there are few of them and ESLint's own output already names the file and line.
- **Row counts are capped and the cap is printed.** A table that silently shows its top ten reads as
  the whole list.
