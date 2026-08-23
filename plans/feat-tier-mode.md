# `ever-better tier` — every rule an error, the files that trip one downgraded to warn

Issue: #58.

## What it is, and what it is not

`freeze` records today's violations and stays **silent** about them. That is the right default and it
is not going anywhere. What it cannot do is put a squiggle under the line while somebody is editing
it: a suppressed violation is unreachable from where the work happens.

`tier` answers the same question the other way. Every rule stays an error; the file-and-rule pairs
that fail today are downgraded to **warn**, in one generated config file. They are visible in the
editor and in every `eslint .`, and re-running the command regenerates the list, which shrinks as
they are fixed.

**It is an alternative to `freeze`, not a layer on top.** A violation downgraded to warn *moves* out
of the per-rule suppression ledger and into the warning population. Running both means the same
violation is counted once in a precise ledger and once in a coarse one, and draining it moves a
number in each.

## What ratchets it, measured rather than assumed

One thing, and it had to be built. The first draft of this plan claimed the warning total came for
free — `freeze` and `check` write `WARNINGS_COUNTER`, and `findRegressions` walks `state.counters`
beside `state.rules`. That is true of a **frozen** repo. A tier repo has never run `freeze`, so
there is no `state.json` and `check` answers *"No baseline"*. Measured, after the claim was written.

- **The exception list, with a count per pair.** Re-running may only shrink it. A pair that fails
  and is not excused is a regression; so is a pair that fails MORE times than it was excused for,
  which is the case a `files`-scoped downgrade cannot see — the whole pair is a warning, so
  `eslint .` exits 0. `.ever-better/tier.json` carries the number for that reason.
- **`ever-better tier --check`** is the gate that reads it, and writes nothing: a check that edits
  the repository it is checking cannot run on a pull request.

What is lost against `freeze` is **granularity**: per rule and per file counts. A file already on
the list can rot internally, held only by the warning total.

## The mechanism that makes re-running possible

Once the overrides are in place the failing pairs report as warnings, so `--suppress-all` — which
records errors — would see none of them and the list could never be recomputed.

CLI `--rule` outranks a `files`-scoped config block. Measured:

```
plain run          1 error + 2 warnings   (the block is in effect)
--rule no-var:error          3 errors     (the block is neutralised)
```

**And it is the wrong mechanism, because it outranks everything.** A type-aware rule forced back on
lands on files outside the type program — a generated `eslint.config.js`, any plain JS — and ESLint
aborts the run: *"you have used a rule which requires type information"*. It survived a fixture with
only `no-var` and died on the first real bootstrapped repository, which is what the e2e is for.

So the generated file steps aside instead. `eslint-tier.config.mjs` drops its exceptions when it
sees `EVER_BETTER_TIER_RECOMPUTE` — keeping only the block that exempts the file itself from being
linted — and `tier` sets that for its own scan: `--suppress-all` into a
temporary location, read the file-by-rule counts out of it, delete it. Nothing global is overridden,
the file that yields is one this tool owns, and ESLint still computes the failing set — nothing here
reimplements it.

## The count, and the gate

A `files`-scoped block downgrades a whole file-and-rule pair, so it cannot express "one of these was
allowed". `.ever-better/tier.json` records the count per pair and `ever-better tier --check` is the
read-only gate that enforces it — without which a second violation inside an already-excused pair is
a warning nothing fails on.

## Where the list lives

A generated file — `eslint-tier.config.mjs`, or `.cjs` when the config it is wired into is CommonJS — wholly owned by this tool and safe to overwrite, the
way `eslint-suppressions.json` is. The user's own config is edited **once**, to import and spread it
last so it wins, and never again. Repeatedly rewriting a file somebody else owns is the thing
`bootstrap` already refuses to do.

## Files

| File | What |
| --- | --- |
| `src/tier.ts` | pure — the list, the comparison, what regressed |
| `src/generate/tierConfig.ts` | pure — render the generated config |
| `src/commands/tier.ts` | run ESLint twice, compare, write or refuse |
| `src/cli.ts` | a command that can fail |
| tests, `README.md`, `README.ja.md` | |

## Verification

- the recompute guard, against real ESLint: the list is recomputed with the exceptions inert, and a
  type-aware rule in the list does not abort the run
- a full cycle on a fixture: tier, fix one file, re-run, watch the list shrink
- a new violation in a file not on the list fails; one in a file on the list becomes a warning and
  is caught by the total
- `yarn format` / `lint` / `typecheck` / `build` / `test` / `knip`, exit codes checked
