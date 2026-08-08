---
description: Entry point for making a repository's quality only go up. Diagnoses what tooling is missing, explains what each gap costs, and routes to the skill that closes it. Use when the user says "この repo の品質を上げたい", "lint を入れたい", "リファクタリングを始めたい", "technical debt", "where do I start with this codebase", or asks what ever-better would do here.
---

# ever-better

Take a repository that has little or no quality tooling and walk it to a state where the code can
only get better. You supply the judgment; the `ever-better` CLI supplies the measurements and the
ledger.

## The idea in one paragraph

ESLint can record every violation that exists today into `eslint-suppressions.json`. Old code is
grandfathered, new code is held to the whole rule set from the first commit, and the recorded
count can fall but never rise. So the hard part is not "which rules" — it is knowing where you
started, and never letting the number go back up. `ever-better` is the diagnosis, the installer
and the ledger around that.

## Phases

| Phase | What happens | Driven by |
| --- | --- | --- |
| P0 diagnose | survey the repo, name every gap | `ever-better diagnose` |
| P1 bootstrap | install missing tooling, generate configs | `ever-better-bootstrap` skill |
| P2 freeze | pin today's violations as the ceiling | `ever-better-freeze` skill |
| P3 drain | fix one rule at a time; the bugs it exposes get tests | `ever-better-drain` skill |
| P4 tighten | add the next tier of rules, repeat | `ever-better-bootstrap` + `-freeze` again |
| P5 split & DRY | remove duplication and dead code | `ever-better-dry` skill |

P3 and P5 are where the value is. Everything before them installs tooling and records a number;
those two bring the number down and take the bugs out with it.

**They automate by default.** A fix, an extracted function, a new test, a deleted orphan — done,
not asked about. Only a refactor that needs the owner's judgment becomes a GitHub issue, and the
issue says what the options are and which one you would pick.

## Work the phases in order, and say which one you are in

Each phase exists because the one before it made it possible: draining before freezing has no
ceiling to lower, and refactoring before the types are in place is done blind. Skipping ahead
usually means doing the same work twice.

So keep the checklist in front of you rather than in your head — `ever-better status` and the
worklist in `QUALITY.md` are it, both derived from the ledger and so incapable of drifting from the
numbers. Re-read it between steps and name the step you are starting. An agent working from memory
does not stop; it quietly merges two steps, drops the verification in the middle, and reports a
phase complete that was never run.

## Leave a trail the owner can read

**Nothing writes the work log for you.** `freeze`, `prune` and `check` record counts; what a count
cost and what it uncovered exists only because somebody wrote it down:

```bash
npx ever-better log --kind drained  --rule max-depth "12 violations; 1 real bug — unreachable branch, deleted with a test"
npx ever-better log --kind deferred --rule max-lines "router.ts is 1400 lines; splitting it is its own project"
npx ever-better log --kind issue    --rule no-floating-promises "opened #42 — swallowed error, product decision"
npx ever-better log --kind note "ESLint 8 -> 9 before freezing, so the ceiling is from the new rule set"
```

The last twenty entries render as the **Work log** table in `QUALITY.md`, and `deferred` also
becomes a **Carried over** checklist.

- **One entry per commit, written as you make it.** Each is stamped with whatever is HEAD at that
  moment, which is what lets a later reader ask whether an old note still describes the code — and
  what a batch written at the end gets wrong for every entry except the last.
- **Write it for the person who was not watching.** An owner returning to six pull requests reads
  this table before the diffs. "fixed max-depth" tells them nothing a diff would not; the rule, the
  count, and the one thing worth knowing — the bug, the decision, the surprise — is the whole value.
- **Log the choices too, not only the work.** A tier left off, a dependency left at its old major,
  a clone deliberately not extracted: `note` and `deferred` exist so a decision is legible later as
  a decision, rather than looking like something nobody got to.

## Dependencies: tooling early, breaking changes once the tests can catch them

Two halves, and the split is about what can tell you when something broke:

- **The toolchain goes up first**, in the bootstrap phase, majors included — linter, formatter,
  type checker, test runner, build tool, and any `resolutions` pinning them. They cannot change what
  ships, only what it says about what ships, and every number recorded later is a number from *this*
  rule set. Freeze against an old ESLint and the upgrade afterwards invalidates the ceiling.
- **Runtime dependencies wait for a test suite that can fail.** A major bump of something the
  product actually calls is exactly the change nobody can review by reading. Until P3 has built real
  coverage, "it still builds" is all you would have. Once the suite is real, take them deliberately —
  one dependency per pull request, so a regression names its own cause.
- **A package nobody maintains is not a version problem.** No release in years, a deprecation
  notice, an issue tracker nobody answers, or a peer range that blocks the upgrade everything else
  needs — none of those are fixed by waiting. Look at what the repo actually uses of it, which is
  usually two functions, and pick: a maintained equivalent, or those two functions written here
  where they can be typed and tested. Both beat a transitive tree that pins the toolchain in place.
  Say which you would pick and what it costs; a devDependency or a small utility you just replace,
  but something load-bearing at runtime is the owner's call and becomes an issue.

## Start here

1. **Check the CLI is reachable.** `npx ever-better --help`. If npx cannot find it, install it:
   `npm install -g ever-better`, or run it from a clone.

2. **Diagnose, read-only.** From the repo root:

   ```bash
   npx ever-better diagnose
   ```

   This writes nothing. Add `--write` once the user wants `QUALITY.md` and
   `.ever-better/state.json` created.

3. **Read the gaps out loud, in the user's terms.** The CLI prints each gap with the phase that
   closes it and one line of why it matters. Do not just paste the output — say which gaps are
   worth closing for *this* repo, and which are noise. A repo of scripts does not need a
   three-platform CI matrix; a published npm package does.

4. **Route.** Depending on what came back:

   - no `CLAUDE.md` / `AGENTS.md`, or a first run on this repo → the **`ever-better-prepare`**
     skill. Everything after it is done by an agent reading instructions; thin instructions produce
     a different answer every session and nobody can tell which was right.
   - the repo is JavaScript → the **`ever-better-migrate`** skill, **before any refactoring**. Types
     are the cheapest rule set there is, the tier that finds the most real bugs cannot run without
     them, and a shape chosen before the compiler has spoken is a shape you will choose again.
   - anything in the `bootstrap` phase → the **`ever-better-bootstrap`** skill
   - bootstrap clean, nothing frozen yet → the **`ever-better-freeze`** skill
   - already frozen, backlog remaining → the **`ever-better-drain`** skill
   - backlog empty, or the user asks about duplication or dead code → the **`ever-better-dry`** skill

## Things worth saying to the user before they commit to this

- **This will produce a large first diff.** Formatting alone touches every file. That is a
  separate PR from anything else, always.
- **`eslint-suppressions.json` gets committed.** It is a record, not a hack, and reviewers should
  understand that before they see it in a diff.
- **The backlog is allowed to sit there.** Grandfathered violations are not a to-do list with a
  deadline; they are a ceiling. The value arrives the moment new code stops adding to it.

## What NOT to do

- **Never soften a rule to make CI green.** The suppressions file already granted the exception,
  once, deliberately. Loosening the rule instead grants it forever and silently.
- **Never run `ever-better freeze` twice to "fix" a red build.** It refuses by design — a second
  freeze would grandfather everything added since the first. `ever-better prune` is how the
  ceiling moves, and it can only move down.
- **Do not enable every tier on day one for a repo nobody has the appetite to drain.** A ceiling
  is only useful if someone believes in it. Ask.
