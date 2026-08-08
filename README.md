# ever-better

[![npm version](https://badge.fury.io/js/ever-better.svg)](https://www.npmjs.com/package/ever-better)
[![ci](https://github.com/isamu/ever-better/actions/workflows/ci.yml/badge.svg)](https://github.com/isamu/ever-better/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/ever-better.svg)](https://www.npmjs.com/package/ever-better)
[![dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [日本語](README.ja.md)

Make an existing codebase one that can **only get better**.

Point it at a repository. It reports what quality tooling is missing, installs it, and records
every violation that exists today as a ceiling. From that commit on, old code is grandfathered and
new code is held to the whole rule set — and the ceiling can fall but never rise.

```bash
npx ever-better diagnose     # read-only: what is missing, and what each gap costs
npx ever-better bootstrap    # install it, generate the configs
npx ever-better freeze       # pin today's violations as the ceiling
npx ever-better check        # CI gate: fail if anything rose
npx ever-better prune        # after a fix: reclaim the ceiling you earned
```

## Hand it to Claude Code

This is how it is meant to be used. Install the plugin, point Claude Code at a repository and say:

```
run ever-better on this repo
```

It diagnoses, installs what is missing, formats, freezes the baseline, then works the backlog down
one rule per pull request — fixing violations, extracting the pure functions that make the fixes
testable, writing the tests, and lowering the ceiling as it goes.

**It decides everything it can from the code.** It opens a GitHub issue and moves on for the few
things that are genuinely not its call: behaviour that is ambiguous (should this throw, retry or
log?), a public API change, a refactor big enough to be its own project, or a rule that may simply
be wrong for this repo. Each issue names the options and which one it would pick.

What arrives, in order: a formatting PR, a tooling PR, a freeze PR, then one PR per rule. On an
untouched repository that is more than a handful — worth knowing before you start it.

```
/plugin marketplace add isamu/ever-better
/plugin install ever-better
```

The skills are `ever-better-run` (the unattended loop above), `ever-better` (entry point and
routing), `ever-better-bootstrap`, `ever-better-freeze`, `ever-better-drain`, `ever-better-dry`.

The CLI below is what those skills call, and it works on its own if you would rather drive.

## Why this exists

Adding a strict linter to an old repository produces four thousand errors and gets reverted. The
usual workaround — set everything to `warn` — means nothing is enforced and the count quietly
grows.

ESLint solved this in core with **bulk suppressions**: `--suppress-all` records how many violations
each rule has in each file, stays silent about exactly those, and reports anything beyond them as
an error. Every rule can be an error from day one without a single existing line changing.

`ever-better` is the part around that: knowing which rules to add in the first place, installing
them, keeping a readable ledger of where you started, and failing CI when a number goes up.

It does not reimplement the ratchet. It is not a linter. It runs *your* ESLint, with *your* config.

## Install

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

### `prune`

After you fix a grandfathered violation, its suppression is stale. `prune` reclaims it, lowering
the ceiling by exactly what you fixed. This is the only way the ceiling comes down.

### `log`

```bash
ever-better log --kind drained  --rule max-depth "6 violations, 1 real bug"
ever-better log --kind deferred --rule max-lines "router.ts is 1400 lines; its own project"
ever-better log --kind issue    --rule no-floating-promises "opened #42 — product decision"
```

Records what happened against the current commit. `deferred` is the one that earns its keep: it
renders into a **Carried over** checklist in `QUALITY.md` with the commit it was seen at, because
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

## Claude Code plugin

Covered at the top — the plugin is the primary interface, and the CLI is what it calls. The split
is deliberate: the CLI does what must be identical on every run (detect, install, count, render,
gate), and the skills do what needs judgment (is this warning a real bug, is this duplication or
coincidence, what deserves an issue).

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

## Design

The CLI does what is deterministic — detect, install, count, render, gate. The skills do what
needs judgment — is this warning a real bug, is this duplication or coincidence, what deserves an
issue. Anything an agent would do slowly or differently on each run belongs in the CLI; anything a
markdown checklist cannot express belongs in a skill.

Zero runtime dependencies.

## License

MIT
