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
   - the repo is JavaScript → the **`ever-better-migrate`** skill. Types are the cheapest rule set
     there is, and the tier that finds the most real bugs cannot run without them.
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
