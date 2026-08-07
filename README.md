# ever-better

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

## What each command does

### `diagnose`

Read-only survey. Reports the package manager, how much of the repo is TypeScript, which of
ESLint / Prettier / a test runner / knip / jscpd are present, what CI runs and on which platforms,
how many files exceed the size limit, and a gap list with the phase that closes each one.

Pass `--write` to persist `QUALITY.md` and `.ever-better/state.json`. Pass `--json` for the raw
diagnosis.

### `bootstrap`

Installs the missing dev dependencies with the repo's own package manager, generates a tiered flat
ESLint config, adds the `lint` / `format` / `typecheck` / `test` scripts CI needs, and writes a
three-platform GitHub Actions workflow.

It never overwrites a config that already exists. `--dry-run` prints the plan and touches nothing.

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

### `status`

Prints the current phase, the backlog, and the rules with the smallest remaining counts — which
are the ones to drain first.

## Artifacts

| File | Owner | Commit it |
| --- | --- | --- |
| `eslint-suppressions.json` | ESLint | yes — it *is* the ceiling |
| `.ever-better/state.json` | ever-better | yes — the ledger |
| `QUALITY.md` | rendered from the ledger | yes — the human view |

`QUALITY.md` is regenerated on every run. Anything you write between the
`<!-- ever-better:notes:start -->` markers survives.

## Claude Code plugin

The repository is also a Claude Code plugin, so an agent can drive the phases with the judgment
the CLI deliberately leaves out — which gaps matter for *this* repo, whether a warning is a real
bug, how to split a function.

```
/plugin marketplace add isamu/ever-better
/plugin install ever-better
```

Skills: `ever-better` (entry point and routing), `ever-better-bootstrap`, `ever-better-freeze`.

## The phases

| Phase | What happens | Status |
| --- | --- | --- |
| P0 diagnose | survey, name every gap | shipped |
| P1 bootstrap | install, generate configs | shipped |
| P2 freeze | pin the ceiling, gate CI | shipped |
| P3 drain | fix one rule at a time; bugs found get tests | planned |
| P4 tighten | add the next rule tier, repeat | planned |
| P5 split & DRY | break up big files, remove duplication | planned |

P3–P5 are where the value compounds. Until they ship, `QUALITY.md` lists the backlog
smallest-first and an ordinary agent session can work it.

## Design

The CLI does what is deterministic — detect, install, count, render, gate. The skills do what
needs judgment — is this warning a real bug, is this duplication or coincidence, what deserves an
issue. Anything an agent would do slowly or differently on each run belongs in the CLI; anything a
markdown checklist cannot express belongs in a skill.

Zero runtime dependencies.

## License

MIT
