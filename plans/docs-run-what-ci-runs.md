# Run what CI runs before a push (#86)

## Problem

`ever-better-bootstrap` keeps the three-platform matrix, but neither `drain` nor `run` says what to
run locally before pushing. One rule per PR means many PRs, and each one that goes red in CI costs a
fix, a push and another review — usually for something a local run would have shown.

## Change

Skill text only:

- `ever-better-drain` step 8: before pushing, run what CI runs — the whole suite, CI's flags, and a
  read of the diff for the platforms that cannot run locally (POSIX paths in expectations, assumed
  `\n`, POSIX-only scripts).
- `ever-better-run`, commit cadence: one paragraph pointing there.

## Out of scope

Reading the workflow to find the commands could be a CLI command, as `diagnose` already reads
workflows to detect a CI gap. Left as a question in the PR.
