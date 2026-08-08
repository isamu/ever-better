---
description: Check that the agent instructions this process depends on actually exist before running it — the user's global CLAUDE.md and the repository's own. Adds only the conventions ever-better assumes, and reports which were already there. Use before `ever-better-run` on a repo for the first time, or when the user says "CLAUDE.md を整えて", "規約を追加して", "set up the conventions", or when a run produced inconsistent work across sessions.
---

# ever-better prepare

Everything after this is done by an agent reading instructions. If those instructions are thin the
process still runs — it just produces a different answer every session, and nobody can tell which
one was right.

Run this once, before the first `ever-better-run` on a repository.

## What to check

Two files, answering different questions:

| File | Question it answers |
| --- | --- |
| `~/.claude/CLAUDE.md` | How does this person want an agent to work, anywhere? |
| `<repo>/CLAUDE.md` | What is true about THIS codebase that the code does not say? |

Read both. Report which of the conventions below are already covered — **do not restate what is
there**, and do not reorganise a file that works. Add only what is missing, in the file's own voice,
and show the diff before writing.

## The conventions this process depends on

Each exists because the process breaks in a specific way without it.

### Global (`~/.claude/CLAUDE.md`)

- **Run the gate after changes** — format, lint, typecheck, build, test — and **judge each by its
  exit code**. A piped command reports the exit status of the last stage, so `yarn lint | tail` is
  always 0 and a failing lint reads as a pass.
- **Commit small and often when working in someone's repository.** One rule per commit during a
  drain. A twenty-file commit mixing a lint fix, a bug fix and a refactor cannot be reviewed or
  reverted, and this process produces exactly that if nobody says otherwise.
- **Never weaken a rule, add an ignore comment, or widen an ignore glob to make a build green.**
  The suppressions file already granted every exception that was justified. If a rule is genuinely
  wrong for the repo that is an issue, not an edit.
- **Verify against external ground truth**, never against another of your own outputs. Two things
  you produced agreeing proves only that they share your assumptions.
- **Ask before commit / push / merge**, and never push to the default branch.

### Repository (`<repo>/CLAUDE.md`)

- **The exact gate commands here** — every repo names them differently.
- **What the tests use and where they live.**
- **The reason behind any rule exception.** If a directory is excluded from a limit, the reason
  belongs beside it, or the next agent deletes the exclusion or copies it somewhere it does not
  apply.
- **Which files are generated** and must not be hand-edited — including the three ever-better
  writes.

## Steps

1. `ever-better diagnose` — its `agent rules` line says which instruction files exist at all.
2. Read both files and list what is already covered. That list is usually longer than expected.
3. Propose the missing entries as a diff, one or two lines each, with the reason.
4. Write only after the user has seen it.

## What not to do

- **Do not paste a template over a file someone maintains.** A CLAUDE.md is accumulated judgment;
  what is missing is usually three lines, not a rewrite.
- **Do not add rules this process does not need.** Every line is read every session, and a file long
  enough to skim is a file nobody follows.
- **Do not copy a global file into a repository.** It describes a person, not a codebase, and it
  will be wrong for the next contributor.
