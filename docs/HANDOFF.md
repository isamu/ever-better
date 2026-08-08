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

- **P3 drain, P4 tighten, P5 split & DRY.** No skills yet. This is the next and most valuable work.
- **No end-to-end test.** The lifecycle above was verified by hand. Automating it — a fixture repo,
  bootstrap, freeze, assert `check` rejects an added violation — is the highest-value test left.
- **knip and jscpd are diagnosed but not installed.** `bootstrap` reports them as gaps and stops
  there. Their counters have a place in `state.json` (`counters`) and nothing writes it yet.
- **No monorepo support.** One baseline per repository. The state shape leaves room for more.
Published and verified on 2026-08-08:

- **`ever-better@0.1.0` is on npm.** `npx ever-better@0.1.0 check` was run against the Vue fixture
  from a clean fetch and behaved correctly, so the `npx ever-better check` step in every generated
  workflow now resolves.
- **The plugin installs.** `claude plugin validate . --strict` passes, and
  `claude plugin marketplace add isamu/ever-better` followed by
  `claude plugin install ever-better@ever-better` registers all three skills (~419 always-on tokens).

Before the next release, run `npm pack --dry-run` and check the file list. The first publish
attempt would have shipped without `formatters/rule-counts.js` — every counting command broken for
installed users, and nothing in the test suite could see it.

## Suggested next steps, in order

1. **Publish 0.1.0 to npm.** Nothing else can be tried by another person until `npx ever-better`
   resolves.
2. **Verify the plugin installs.** `/plugin marketplace add isamu/ever-better`, then check the
   three skills appear and the entry-point skill routes correctly.
3. **Run it on a real repo that is not this one.** `~/tne/orion` is the obvious candidate, and the
   one the process was designed against. Expect the diagnosis to be right and the generated config
   to need one or two adjustments — capture those as generator changes, not local edits.
4. **Write the `ever-better-drain` skill (P3).** Read `QUALITY.md`, take the smallest backlog, fix
   it rule by rule, extract pure functions where a fix needs a test, `prune`, commit. This is where
   the original process actually lives.
5. **Add the end-to-end test.**
6. **Then P4 / P5.**

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

## Open questions for isamu

- Publish as `ever-better` unscoped, or under a scope?
- Should `bootstrap` install knip and jscpd, or keep them as a later tier?
- The generated file line limit is 600, copied from mulmoterminal. Is that the right default for
  other people's repos, or should `bootstrap` propose one from the repo's own distribution?
