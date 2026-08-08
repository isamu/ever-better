# Handoff

Where this project came from, what is built, and what to do next. Written 2026-08-08 (JST) at the
end of the session that created the repository.

## Where the idea came from

isamu had been refactoring several repositories — `mulmoterminal`, `~/tne/orion` and others — with
a repeatable process, and wanted other people to be able to run it:

1. Get types in place. Set up ESLint, start the basics at `warn`.
2. Draining those warnings finds real bugs.
3. Pin each bug with a unit test — extracting a pure function first where that makes it testable.
   (If there is no test setup, create one. If the repo is JavaScript, convert to TypeScript.)
4. Once the basics are clean, tighten with SonarJS.
5. Make functions and files smaller; add many more tests.
6. Remove duplication.
7. In parallel: set up CI, review on CI, and cross-review locally against a second model.
8. Write CLAUDE.md so agents follow the repo's rules.

The public write-up of the same approach:
<https://zenn.dev/singularity/articles/stopped-reviewing-my-code>

The ask was: **diagnose first, install what is missing, keep a checklist file, work through it
while updating that file, and file issues for the unknowns.** Distributed as a repository other
people can install.

## Decisions made, and why

| Decision | Chosen | Why |
| --- | --- | --- |
| Form | **npm CLI + Claude Code plugin, one repo** | Detection and counting must be identical every run; judgment cannot be written as a checklist. Splitting on that line is the whole architecture. |
| Scope | **TS + npm/yarn/pnpm/bun, JS→TS included** | JS→TS is where the type-aware tier — the valuable half — comes from. |
| Home | **`github.com/isamu/ever-better`** | isamu's own account. npm name `ever-better` was free. |
| MVP | **P0 diagnose, P1 bootstrap, P2 freeze** | The reusable half. P3–P5 are agent work that the artifacts from P0–P2 make possible. |
| Name | **ever-better** | Positive and needs no jargon. `ratchet-up` was the runner-up and technically more precise, but `ratchet` is negative slang in American English. |

### The one that changed the design

The original plan followed the article: rules at `warn`, drain, then promote to `error`.

**ESLint ships bulk suppressions in core**, which is strictly better where it applies:
`eslint --suppress-all` records today's violations per file and per rule, stays silent about
exactly those, and reports anything beyond them as an error. Every rule can be an `error` from day
one without a single existing line changing — new code is held to the full standard immediately,
old code is grandfathered.

So `ever-better` does not implement warn-then-promote, and does not implement a ratchet at all. It
installs, measures, records, and gates. Docs: <https://eslint.org/docs/latest/use/suppressions>

The third-party ratchets (`betterer`, `eslint-seatbelt`, `eslint-formatter-ratchet`) all predate
this and were last published over a year ago. Do not adopt or reimplement them.

## What is built and verified

All of P0–P2, verified end-to-end against real ESLint on a scratch repository:

```
diagnose → bootstrap → freeze (13 violations grandfathered, eslint exits 0)
        → add a new violation      → check FAILS   (exit 1)
        → remove it, fix a real one → prune         (ceiling 13 → 12 → 11)
        → check PASSES
```

`diagnose` was also run read-only against `~/ss/llm/mulmoterminal` (1381 source files) and its
output matched what that repo actually has.

Repo gate is green: `format`, `lint`, `typecheck`, `build`, and 67 `node:test` cases.

Two bugs found by dogfooding, both fixed and pinned by tests — see CLAUDE.md, "Anything that ships
to users needs the generator tested".

## Framework support (added the same day, on `feat/framework-support`)

Vue, Nuxt, React and Next are detected and get a config shaped for them; Svelte and Astro are
detected and reported as a gap rather than silently handed a config that skips their files.

Verified by building fixtures with real dependencies under the scratchpad and running the actual
ESLint against them — `fx-vue` (Vue 3 SFC + `<script setup lang="ts">`) and `fx-next` (Next 16 App
Router, client components). Both went through the whole lifecycle: bootstrap, freeze, a new
violation rejected, a warning-only file rejected by the warnings ratchet, then green again.

Four things that reading documentation would have got wrong, all now pinned by tests:

1. `eslint-plugin-react` peers at eslint `^9.7` — it cannot be installed alongside ESLint 10, so
   it is deliberately left out.
2. `eslint-plugin-react-hooks` flat configs live under `configs.flat[...]`; the top-level entries
   are eslintrc shape and make flat config refuse the whole file.
3. `.vue` needs `extraFileExtensions` and correct block ordering, or every SFC is a parse error.
4. `--suppress-all` records errors only, so warnings needed their own ratchet.

## Two Windows-only bugs the matrix caught

Neither reproduces on macOS, and both passed Linux and macOS CI before failing on Windows:

1. `format:check` reported **every file** as unformatted — Git checks out CRLF on Windows,
   Prettier normalises to LF. Fixed with `.gitattributes` (`* text=auto eol=lf`), and `bootstrap`
   now writes one into every repo it sets up, since it also writes a three-platform workflow.
2. `ever-better check` failed with ENOENT spawning `node_modules/.bin/eslint`. On Windows that
   directory holds both an extensionless shell script and an `eslint.cmd`; Node can spawn neither
   directly. Now resolves `node_modules/eslint/bin/eslint.js` and runs it with `process.execPath`.

Keep the three-platform matrix. It is the only thing that sees this class of bug.

## What is NOT built

Everything from the original scope has shipped. What remains was never in it:

- **No monorepo support.** One baseline per repository — [#30](https://github.com/isamu/ever-better/issues/30).
  Medium: ESLint's `--suppressions-location` means a per-package ceiling needs no new mechanism, so
  what is left is workspace discovery and one design decision about the ledger's shape.
- **Python.** [#31](https://github.com/isamu/ever-better/issues/31). Large but not a rewrite: Ruff
  owns the primitives, and the ledger, renderer, `check` and ratchet are reusable behind an
  ecosystem seam. The two hard parts are that Ruff has no external suppressions file (the ceiling
  lives in the source) and that type checking has no first-party baseline at all.

Both are sized in their issues. Neither is a prerequisite for the other, and both should wait until
this has been run end to end on a repository that is not this one.

## The target state

What a repository looks like when the process has run to completion, so it is clear what all of
this is for:

- **CI locked down.** Lint, typecheck, build, tests on three platforms; the gate rejecting any new
  violation; duplication and dead code reported per pull request; a second model reviewing the diff.
- **Complexity gone.** SonarJS cognitive complexity, function length, nesting and branch counts all
  enforced, with the backlog drained to zero rather than grandfathered forever.
- **Types complete.** `strict` plus every flag it does not include, and the type-aware lint tier
  enforcing rather than warning.
- **Tests that have been seen to fail**, covering the pure functions the drain phase extracted.

The point of the whole thing: **whoever writes the next line cannot break it quietly.**

## Suggested next steps, in order

1. **Run it on a repository that is not this one.** `~/tne/orion` is the obvious candidate. Expect
   the diagnosis to be right and the generated config to need one or two adjustments — capture
   those as generator changes, not local edits.
2. **Monorepo support**, if a target needs it.
3. **Python**, after the above.

## Reference material

- The reference implementation of the target state is `~/ss/llm/mulmoterminal`: `eslint.config.js`
  (388 lines, tiered, every exception commented with its reason), `.github/workflows/codex_review.yaml`,
  `duplication-scan.yaml` (jscpd + SARIF), `dead-code-scan.yaml` (knip), `windows-daily.yaml`.
  When P4/P5 need a shape, copy from there rather than inventing one.
- Existing skills in `~/.claude/skills/` already cover the back half of the process and should be
  referenced, not duplicated: `ci_enable`, `ci-fix`, `codex-local-review`, `codex-cross-review`,
  `pr-quality-sweep`, `gh-review-loop`.
- Version constraint worth remembering: **TypeScript stays on `^6.0.3`**. `typescript-eslint@8`
  declares support for `typescript <6.1.0`, so TS 7 breaks the linter this tool exists to
  configure.

## Settled: no framework migration

Vanilla JS -> Vue migration was raised and **declined** (2026-08-08). Do not re-propose it. It is a
rewrite rather than a ratchet — there is no count that only goes down, and the success criterion is
different in kind from everything else here.

JS -> TS migration is NOT covered by that decision and stays in scope: types are what make the
type-aware tier possible, so the ceiling means more once they are in. It is already reported as a
gap and belongs to the P3 `ever-better-migrate` skill.

## Python: evaluated, feasible, deferred

Raised 2026-08-08. Checked against Ruff's actual documentation rather than assumed.

**The phase model transfers, and Ruff has the primitives**, so this does not need a ratchet of our
own any more than the JS side did:

| ever-better | JavaScript | Python |
| --- | --- | --- |
| freeze | `eslint --suppress-all` | `ruff check --add-noqa` |
| check | `eslint .` | `ruff check` (with `RUF100` selected) |
| prune | `eslint --prune-suppressions` | `ruff check --select RUF100 --fix` |
| format | prettier | `ruff format` |

`RUF100` (`unused-noqa`) is Ruff's own rule for a suppression whose violation is gone — the same
job `--prune-suppressions` does.

**The one real difference**: Ruff has **no external suppressions file**. `--add-noqa` writes a
`# noqa: RULE` comment onto every violating line, so the ceiling lives in the source. Consequences
to design around, not to discover later:

- The first freeze is an enormous, invasive diff — a comment per violating line, rather than one
  JSON file. It must be its own commit, and the skill has to say so up front.
- The ceiling is per-line rather than a count, so the ledger counts the markers instead of reading
  a file ESLint maintains.
- It interacts with formatting: `ruff format` after `--add-noqa` can move the comments.

**Unclear, and the reason to scope the first Python release to linting only**: type checking has no
first-party baseline. mypy has none built in (`mypy-baseline` is third-party), and pyright uses
inline `# type: ignore`. Ship Ruff first; treat types as a later tier, exactly as the JS side treats
the type-aware rules as a separate step.

**Cost**: a medium refactor, not a rewrite. `RepoFacts` currently bakes in `package.json`, and
`findEslint` looks in `node_modules`. Both need an ecosystem seam — detect `js` / `python`, then a
driver exposing detect / plan / freeze / count / prune. The state file, the `QUALITY.md` renderer,
`check`, and the whole ratchet logic are reusable unchanged.

**Order**: after P3 drain. Drain is what makes the tool worth adopting in the first language; a
second language before that doubles the surface with nothing behind it.

## Open questions for isamu

- Publish as `ever-better` unscoped, or under a scope?
- Should `bootstrap` install knip and jscpd, or keep them as a later tier?
- The generated file line limit is 600, copied from mulmoterminal. Is that the right default for
  other people's repos, or should `bootstrap` propose one from the repo's own distribution?
