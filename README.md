# ever-better

[![npm version](https://badge.fury.io/js/ever-better.svg)](https://www.npmjs.com/package/ever-better)
[![ci](https://github.com/isamu/ever-better/actions/workflows/ci.yml/badge.svg)](https://github.com/isamu/ever-better/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/ever-better.svg)](https://www.npmjs.com/package/ever-better)
[![dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [日本語](README.ja.md)

Make an existing codebase one that can **only get better**.

It reports what quality tooling a repository is missing, installs it, and records every violation
that exists today as a ceiling. From that commit on, old code is grandfathered and new code is held
to the whole rule set — and the ceiling can fall but never rise.

## How to use it: hand a repository to Claude Code

This is the primary interface. Install the plugin once, from any Claude Code session:

```
/plugin marketplace add isamu/ever-better
/plugin install ever-better
```

Then `cd` into the repository you want improved, start Claude Code **there**, and say:

```
run ever-better on this repo
```

That is the whole setup. The target repository needs nothing prepared in advance, and you do not
have to install the CLI — the skills reach it through `npx`.

### What that one sentence does

It diagnoses, installs what is missing, formats, freezes the baseline, then works the backlog down
one rule per pull request — fixing violations, extracting the pure functions that make the fixes
testable, writing the tests, and lowering the ceiling as it goes.

**It decides everything it can from the code.** It opens a GitHub issue and moves on for the few
things that are genuinely not its call: behaviour that is ambiguous (should this throw, retry or
log?), a public API change, a refactor big enough to be its own project, or a rule that may simply
be wrong for this repo. Each issue names the options and which one it would pick.

What arrives, in order: a formatting PR, a tooling PR, a freeze PR, then one PR per rule. On an
untouched repository that is more than a handful — worth knowing before you start it.

### Asking for less than the whole thing

The sentence above starts the unattended run. Ask for something narrower and it routes to the skill
that covers it — you never name a skill yourself:

| What you say | What runs |
| --- | --- |
| "run ever-better on this repo", "clean this repo up" | the whole process, unattended — `ever-better-run` |
| "what would ever-better do here", "where do I start with this codebase" | diagnose and route one phase at a time — `ever-better` |
| "set up the conventions", "CLAUDE.md を整えて" | `ever-better-prepare` |
| "migrate this to TypeScript", "ts化して" | `ever-better-migrate` |
| "set up linting here", "lint を入れて" | `ever-better-bootstrap` |
| "freeze the baseline", "grandfather the existing violations" | `ever-better-freeze` |
| "drain the backlog", "リファクタリングして" | `ever-better-drain` |
| "remove the duplication", "dead code を消して" | `ever-better-dry` |

### Reading this README to an agent is not the same thing

Pointing Claude Code at this page gives it the commands, not the process — which violation is a
real bug, what deserves an issue rather than a fix, when to stop and ask, what belongs in the work
log. That part is the skills, and the skills arrive with the plugin.

## Why this exists

Adding a strict linter to an old repository produces four thousand errors and gets reverted. The
usual workaround — set everything to `warn` — means nothing is enforced and the count quietly
grows.

ESLint solved this in core with **bulk suppressions**: `--suppress-all` records how many violations
each rule has in each file, stays silent about exactly those, and reports anything beyond them as
an error. Every rule can be an error from day one without a single existing line changing.

`ever-better` is the part around that: knowing which rules to add in the first place, installing
them, keeping a readable ledger of where you started, and failing CI when a number goes up.

**It is also the only exemption the generated config allows.** `eslint-disable` comments are
switched off (`noInlineConfig`), along with `@ts-ignore`, `@ts-nocheck`, `as`, `!` and `any` — not
out of severity, but because a disable comment removes the violation from the linter *and* from
`eslint-suppressions.json`. Nothing counts it, `status` and `report` cannot see it, and `prune` can
never reclaim it: a permanent exemption in a tool whose one promise is that the ceiling can fall but
never rise. Grandfathering something means freezing it, where it becomes a number obliged to come
down.

It does not reimplement the ratchet. It is not a linter. It runs *your* ESLint, with *your* config.

## Driving the CLI yourself

The skills above call this CLI, and it works on its own if you would rather drive.

```bash
npx ever-better diagnose     # read-only: what is missing, and what each gap costs
npx ever-better bootstrap    # install it, generate the configs
npx ever-better freeze       # pin today's violations as the ceiling
npx ever-better check        # CI gate: fail if anything rose
npx ever-better next         # what to drain first, and what each fix enforces
npx ever-better report       # where the findings are, as markdown (for a CI job summary)
npx ever-better secrets      # scan the whole history for committed credentials
npx ever-better tier         # every rule an error, the files that trip one downgraded to warn
npx ever-better prune        # after a fix: reclaim the ceiling you earned
```

```bash
npm install -g ever-better     # or run it with npx, or yarn add --dev ever-better
```

Node 20.11 or later. Works with yarn, npm, pnpm and bun — the package manager is detected from the
lockfile.

## Frameworks

The generated config is shaped by what the repo actually is. Detection is by dependency, most
specific first, so a Next app is not filed as plain React.

| Detected | What you get |
| --- | --- |
| **Vue** / **Nuxt** | `eslint-plugin-vue` flat config, `.vue` wired into the type program, `vue-tsc` as the typecheck script, and the unsafe-any family switched off for SFCs |
| **React** | `eslint-plugin-react-hooks` — rules of hooks and exhaustive deps, the ones that catch real bugs |
| **Next** | the React set plus `@next/eslint-plugin-next` core-web-vitals, and `.next/` ignored |
| **Svelte** / **Astro** | detected and reported as a gap; their file types are not configured yet |
| none | plain TypeScript / JavaScript |

Frontend repos get browser **and** node globals, because their config files, scripts and tests run
under Node — browser-only globals produce a wall of false `no-undef` that says nothing.

Two deliberate choices worth knowing about:

- **`eslint-plugin-react` is not installed.** Its peer range stops at ESLint `^9.7`, so installing
  it next to the ESLint 10 this tool sets up fails outright and would leave the repo with no
  linter at all. `eslint-plugin-react-hooks` supports 10 and covers the bug-finding rules; the
  rest of that plugin is mostly JSX style, which Prettier settles.
- **`vue-tsc`, not `tsc`, for Vue.** `tsc` cannot read an SFC at all, so `tsc --noEmit` in a Vue
  repo exits 0 while silently skipping every component.

The config is written as `eslint.config.mjs` unless `package.json` declares `"type": "module"` —
it is ESM either way, and in a CommonJS package a `.js` file makes Node reparse and warn on every
lint run.

Everything bootstrap writes is shown in **[docs/generated-config.md](docs/generated-config.md)** —
rendered from the generators themselves, so it cannot drift from what you actually get.

## What each command does

### `diagnose`

Read-only survey. Reports the package manager, how much of the repo is TypeScript, which of
ESLint / Prettier / a test runner / knip / jscpd are present, what CI runs and on which platforms,
how many files exceed the size limit, and a gap list with the phase that closes each one.

Pass `--write` to persist `QUALITY.md` and `.ever-better/state.json`. Pass `--json` for the raw
diagnosis.

### `bootstrap`

Installs the missing dev dependencies with the repo's own package manager and generates the four
layers the approach depends on, each covering what the others cannot see:

| Layer | Tool | What it sees |
| --- | --- | --- |
| function size and complexity | ESLint core rules | long functions, deep nesting, too many branches |
| bindings that move | `no-var`, `prefer-const`, `no-param-reassign` | `var`, a `let` nothing reassigns, an argument overwritten under the caller |
| types and readability | SonarJS + `strictTypeChecked` | unsafe `any`, cognitive complexity |
| cross-file duplication | jscpd, into Code Scanning | copy-paste the linter cannot see |
| dead code | knip | exports nobody imports, orphaned files |

Plus the `lint` / `format` / `typecheck` / `test` / `knip` scripts CI needs, a three-platform
workflow, `.gitattributes`, `.prettierignore`, and `dependabot.yml` so the pinned action versions
stay current after ever-better has stopped looking.

It never overwrites a config that already exists — the exceptions in it have reasons that are not
in the file. The one exception is `.prettierignore`, which is line-based and so is appended to.
`--dry-run` prints the plan and touches nothing.

### `freeze`

Runs `eslint --suppress-all`, records the resulting per-rule counts as the ceiling, and renders
`QUALITY.md`. Commit `eslint-suppressions.json`, `.ever-better/state.json` and `QUALITY.md`
together.

Running it a second time is refused: that would grandfather everything added since. Use `prune` to
lower the ceiling, or `--force` if a rule was genuinely reconfigured.

### `check`

The CI gate. Fails when there are unsuppressed violations, or when any recorded count rose above
its ceiling. Add it to the workflow after `lint`.

### `next`

```bash
ever-better next
ever-better next --json
```

The drain order, computed rather than guessed. The suppressions file records a count **per file per
rule**, and the ratchet works the same way — a file with no suppression left for a rule fails on the
next violation of it, whatever that rule's total is elsewhere. So the useful question is not "which
rule is smallest" but "which edit enforces the most", and `next` answers it in four lists:

| Section | What it is for |
| --- | --- |
| take these first | files one or two violations from clean — one edit each, and that rule is enforced there for good |
| rules by files to touch | 40 violations in 3 files and 38 across 31 are the same size in `status` and ten times apart in work |
| the last files carrying a rule in their directory | the tail of a directory nobody finished |
| leave these until last | files whose count is a redesign rather than a backlog |

It reports the last files still *carrying* a rule, which is not the same claim as "the rest of that
directory is clean": a file ESLint never looks at has no entry either, and no arithmetic over this
file can tell the two apart.

```bash
ever-better next --fan-in
```

`--fan-in` adds one number to those rows — how many files import each one — because the other half
of "how hard is this" is how far the fix reaches. A `no-explicit-any` in a module twenty files
import changes an exported shape, and the errors land in files the diff never opened.

It is a flag rather than the default because it reads **every source file** in the repository to
parse its imports: the weight of `migrate`, not of a command you run between edits. And it
deliberately **reorders nothing** — fan-in makes a *type* fix expensive and says nothing about
`max-depth`, where the fix is local however many files import the module. The number is reported;
which rules it applies to is judgment, and judgment is the skills' half of this tool.

The count is direct importers, not transitive reach, and only relative specifiers resolve — a file
imported solely through a path alias reads low.

### `report`

```bash
ever-better report
ever-better report --json
```

Markdown: the backlog as a **rule x area** table, so the shape of the debt is visible rather than
just its size. Where `next` answers "which edit enforces the most", this answers "what does this
repository's lint debt actually look like".

It is written to stdout and **appended to `$GITHUB_STEP_SUMMARY`** when that is set, which is what
makes it a CI report without anyone editing a workflow. The generated gate workflow runs it after
`check` with `if: always()` — the run where `check` has just failed is the run where the backlog is
worth most.

Warnings get their own section, and that is the point of including them: ESLint's suppressions cover
**errors only**, so a warning is never grandfathered and never drains. `state.json` keeps one grand
total for the whole warning population and no rule ever appears in it; this is the only place that
breakdown exists.

**It is never a gate.** It cannot change an exit code, and it does not fail when the summary file
cannot be written. If ESLint cannot run at all, it falls back to `eslint-suppressions.json` and says
so in the output — "no warnings" and "nobody looked for warnings" must not render the same way.

### `secrets`

```bash
ever-better secrets
```

Runs `gitleaks` over the **history and the working tree** and fails on any finding. `bootstrap` also
writes `.github/workflows/secret-scan.yml`, so this is the check before you push rather than the
gate.

Both scans, because either alone passes a repository that is holding a secret: the history scan
misses the key you pasted an hour ago and have not committed, and a working-tree scan misses the key
that was committed and then deleted — which is still in every clone. A repository with no commits at
all reports "no leaks found" from the history scan having read nothing.

**This is the one thing here with no baseline, and that is the point.** Every other rule records
what exists and holds the line. A committed key is already public — it is in every clone and on
somebody's dashboard — so there is nothing to grandfather and the fix is rotation, not a commit. The
output says so rather than implying that deleting the line helps.

Three answers, not two, because gitleaks reports a finding and its own failure with the same exit
code unless asked otherwise:

| | |
| --- | --- |
| clean | exit 0 |
| secrets found | exit **2**, and the finding, redacted |
| **the scan could not run** | exit **1**, saying so — not a clean result |

That last row matters more than it looks. Outside a git work tree `gitleaks detect` logs an error,
scans **zero commits**, and exits 0 with "no leaks found" — a clean bill of health for a scan that
read nothing. This refuses instead.

The generated workflow carries the details that are easy to get wrong: the MIT CLI rather than
`gitleaks-action` (which needs a licence key under a GitHub Organization), a checksum-verified
download, `fetch-depth: 0` because a shallow clone misses the commit that leaked, and `--redact` so
the secret does not land in a public log.

### `tier`

```bash
ever-better tier
```

**The other way to start, and an alternative to `freeze` rather than a layer on it.** Every rule
stays an error; the file-and-rule pairs failing today are downgraded to **warn** in a generated
`eslint-tier.config.mjs`. Fix what a file is listed for, run it again, and the entry disappears — the
rules get stricter without anyone editing a config.

| | `freeze` | `tier` |
| --- | --- | --- |
| in your editor | invisible — no squiggle | a warning while you type |
| in `eslint .` | silent | listed every run |
| granularity | file x rule, **with a count** | file x rule, no count |
| tightening | `prune`, per violation | re-run, per file x rule |

Two things hold the line, and one arrives for free. **The warning total is already ratcheted** —
`check` walks `state.counters` beside `state.rules`, so a warning population growing past its
baseline fails today. And **the list may only shrink**: a pair that fails and is not already excused
is new code breaking a rule that was already an error for it, so `tier` refuses to write it in and
exits 1 rather than legalising it.

What you give up against `freeze` is granularity — per rule and per file counts. A file already on
the list can rot internally, held only by the total.

**Do not run both.** A violation downgraded to warn *moves* out of the suppression ledger into the
warning population; running both counts it once in a precise ledger and once in a coarse one.

The generated file is wholly owned by the tool and safe to overwrite, the way
`eslint-suppressions.json` is; your own config is edited **once**, to spread it last so it wins. It is
`eslint-tier.config.mjs`, or `eslint-tier.config.cjs` beside an `eslint.config.cjs` — never a bare
`.js`, which would mean CommonJS in a package that does not declare `"type": "module"`.

One run at a time: `tier` takes `.ever-better/tier.lock` for the whole read-scan-write, because two
overlapping runs would each publish a list computed before the other's fixes landed and the later
write would re-open what the earlier one drained. A lock whose process is gone is taken over, so a
crashed run cannot wedge the repository.

**Commit both generated files.** `eslint-tier.config.mjs` is what ESLint reads; `.ever-better/tier.json`
is the list the next run compares against. A missing ledger means there is nothing to compare to, so
the run takes a fresh tier — and an empty ledger is **not** the same as a missing one. A repository
whose list has drained to nothing is the strictest state there is, and a violation appearing there is
refused exactly like any other.

### `prune`

After you fix a grandfathered violation, its suppression is stale. `prune` reclaims it, lowering
the ceiling by exactly what you fixed. This is the only way the ceiling comes down.

### `log`

```bash
ever-better log --kind drained  --rule max-depth "6 violations, 1 real bug"
ever-better log --kind deferred --rule max-lines "router.ts is 1400 lines; its own project"
ever-better log --kind issue    --rule no-floating-promises "opened #42 — product decision"
```

Records what happened against the current commit, and it is the only thing that writes the **Work
log** in `QUALITY.md` — every other command records counts, never why. `deferred` is the one that
earns its keep: it renders into a **Carried over** checklist with the commit it was seen at, because
"router.ts needs splitting" is useless four hundred commits later unless a reader can tell when it
was true.

### `migrate`

```bash
ever-better migrate                              # the plan, in dependency order
ever-better migrate --all                        # rename the whole repo, priced
ever-better migrate --file src/util/text.js      # one rename, priced
```

JavaScript to TypeScript. Writes a `tsconfig.json` with `allowJs` and `checkJs: false` first, so the
repo compiles exactly as it is today, then renames — everything at once with `--all`, or one file at
a time — and reports how many type errors that cost.

**Lint errors are not a reason to stop.** They are what the ratchet is for: `freeze` records them as
the ceiling and they come down rule by rule afterwards. A rule that fires on a legitimate pattern in
this repo is a config decision, not a migration one.

**Type errors are the part that cannot be grandfathered.** `--suppress-all` covers lint violations
and the compiler has no equivalent, so `--all` prices the rename and leaves the number in front of
you: fix what blocks the build, or start from a looser `tsconfig.json` and tighten it with
`ever-better strictness`, which measures each flag before you turn it on.

**`--file` migrates in dependency order**, computed from the import graph, for a repo that would
rather take the errors a few at a time. Typing a file whose imports are still JavaScript means
typing it against `any`, and that work is redone once the dependency lands.

### `catalog`

```bash
ever-better catalog
```

Writes `docs/shared-helpers.md`: every exported function, grouped by directory, with the first
sentence of its doc comment. Point your CLAUDE.md at it.

It fills the gap between the two scans. A linter sees inside one file; duplication detection only
notices copies once they are textually similar, and two independent implementations of the same
idea rarely are. Nothing else reports the same function written a sixth time under a sixth name.

### `emit-diff`

```bash
ever-better emit-diff                  # against HEAD
ever-better emit-diff --against main
```

Compiles the working tree and a git ref, and compares the emitted JavaScript.

A refactor that only moves types — narrowing a parameter, deleting an `as`, splitting an interface
— erases at compile time. Byte-identical output **proves** the change cannot alter behaviour, which
no amount of test coverage states as strongly and which takes seconds rather than an afternoon.
When the output does differ, the files it names are where to look.

### `status`

Prints the current phase, the backlog, and the rules with the smallest remaining counts — which
are the ones to drain first. It leads with a `STALE` line when the diagnosis is more than thirty
days old, fifty commits behind, or was taken on a commit no longer in this history (a rebase or
force-push). The ratchet itself never goes stale — ESLint maintains it against the current tree —
but the gap list, the file sizes and every deferred note do.

## Artifacts

| File | Owner | Commit it |
| --- | --- | --- |
| `eslint-suppressions.json` | ESLint | yes — it *is* the ceiling |
| `.ever-better/state.json` | ever-better | yes — the ledger |
| `QUALITY.md` | rendered from the ledger | yes — the human view |

`QUALITY.md` is regenerated on every run and carries four sections rendered from the ledger: a
**Worklist** of phases as checkboxes with the smallest remaining rules as sub-items, **Carried
over** for refactors deliberately not made, the **Ratchet** table, and a **Work log**. Anything you
write between the `<!-- ever-better:notes:start -->` markers survives.

## The phases

| Phase | What happens | Status |
| --- | --- | --- |
| P0 diagnose | survey, name every gap | shipped |
| P1 bootstrap | install, generate configs | shipped |
| P2 freeze | pin the ceiling, gate CI | shipped |
| P3 drain | fix one rule at a time; bugs found get tests | shipped |
| P4 tighten | add the next rule tier, repeat | shipped |
| P5 split & DRY | remove duplication and dead code | shipped |

P3 and P5 are where the value is, and they **automate by default**: a fix, an extracted function,
a new test, a deleted orphan — done, not asked about. Only a refactor needing the owner's judgment
becomes a GitHub issue, and that issue says what the options are and which one the agent would
pick.

## Results, and what they do not yet show

[`docs/RESULTS.md`](docs/RESULTS.md) collects what people froze and how much of it turned out to be
defects rather than style. It has **two rows, and both are mine** — a 13-year-old JavaScript CLI and
a current TypeScript app — which is enough to notice a pattern and nowhere near enough to claim one.

Both, so far, produced the same bug: a lookup keyed on a string from outside, answered by the
prototype chain, which no type system objects to.

If you run this on anything, please add a row —
[report a run](https://github.com/isamu/ever-better/issues/new?template=results.yml). Numbers only,
no source. A run that found **zero** real bugs is the most useful row that table could get.

## Design

The CLI does what is deterministic — detect, install, count, render, gate. The skills do what
needs judgment — is this warning a real bug, is this duplication or coincidence, what deserves an
issue. Anything an agent would do slowly or differently on each run belongs in the CLI; anything a
markdown checklist cannot express belongs in a skill.

Zero runtime dependencies.

## License

MIT
