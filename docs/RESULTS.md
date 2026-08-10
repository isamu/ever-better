# Results

What ever-better froze on real repositories, and how much of it turned out to be defects rather
than style.

**Two rows are not a finding.** Both below are mine, which means the only thing they establish is
that the question is worth asking. Add yours with the
[report-a-run template](https://github.com/isamu/ever-better/issues/new?template=results.yml) —
numbers only, no source.

## Runs

| Repository | Frozen | Now | Elapsed | Real bugs | Entry |
| --- | ---: | ---: | --- | ---: | --- |
| [pm2](https://github.com/Unitech/pm2) — JavaScript, 13 years, ★43k | 4,942 | 3,278 + 1,037 warn | 2 days / 102 commits | 13 | plugin |
| private — TypeScript, current, ~900 files | 3,689 | 741 | 5 days / 207 PRs | 8+ | plugin |

The second row's "frozen" is measured rather than recorded: `no-explicit-any` was `off` in most
directories on day one, so the freeze at the time read 79 for that rule. 3,689 is the same tree
with every tier switched on — the honest starting point, and the reason a raw before/after on that
repository understates the work by a factor of five.

## What the bugs were

The pattern that repeats across both, and the reason this file exists:

| Rule | Bugs | What it actually was |
| --- | ---: | --- |
| `security/detect-object-injection` | 8 | A lookup keyed on a string from outside, answered by the prototype chain. `table["constructor"]` returns a function nobody put there, the `if (!found)` guard never fires, and the not-found branch is dead. **No type objects** — `Record<string, T>` claims that key holds a `T`. |
| `no-undef` | 2 | Two `ReferenceError`s in pm2, both on paths that only run after something else has already failed. Thirteen years unreported, because the user sees a stack trace instead of the message the author wrote. [Fixed upstream](https://github.com/Unitech/pm2/pull/6143). |
| `sonarjs/super-linear-regex` | ~112 fixed | Quadratic and cubic patterns. Fine on every input anyone tried; freezes on the one nobody did. Worth noting: the rule was wrong in both directions — it flagged patterns that did not blow up, and missed a cubic one. Each was confirmed by measuring runtime against input length before being fixed. |

## What would make this file useful

- **More languages.** Both rows are JS/TS. A rule set's bug yield is not portable across ecosystems.
- **A repository nobody's author is reporting on.** Both rows are self-reported by the person who
  ran the tool, which is the weakest possible evidence.
- **Negative results.** A run that froze 3,000 violations and found zero defects is the most
  valuable row this table could get, and the least likely to be volunteered.
