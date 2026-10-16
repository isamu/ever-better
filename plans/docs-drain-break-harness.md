# Drain step 6: breaking the code has to put it back (#86)

## Problem

`ever-better-drain` step 6 says to break the code under test, run the test and restore. A rule
fixed at several sites means several breaks, and the step says nothing about doing that safely. In
an unattended run, a break left behind, a pattern that matched nothing, or a count taken only
against the PR's own tests each produce a result that looks fine and is not.

## Change

Skill text only, in step 6:

- one break at a time, each an exact replacement asserted to match once;
- a copy of each file, compared before every break and after every restore;
- restore from the copy, not `git checkout`;
- arrays for file lists in shell loops (zsh does not split an unquoted variable);
- count with every test, and with only the tests that existed before the PR.

## Out of scope

A CLI command that runs the breaks. Running them is deterministic, so by this repo's own rule it
could live in `src/`; choosing what to break is judgement and stays in the skill. Left as a
question in the PR.
