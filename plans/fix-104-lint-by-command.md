# The lint gate is what runs eslint, not what is called `lint`

Fixes #104.

## The defect

Two findings asked whether a script with the literal name `lint` exists and is invoked. A
repository whose script is called `eslint` therefore reported both "missing package scripts: lint"
and "CI does not run lint" while running it on every pull request. Measured on receptron/graphai at
`fe450a1e`; the issue carries the commands.

`src/detect/ci.ts` was already careful about every other way a lint step can be written — `run`
versus `uses`, `yarn lint` versus `yarn run lint`, a `lint:fix` namespace, a printed command, a
commented-out step, a step switched off. The one thing it did not consider is that the script might
be called something else.

A false gap is the expensive direction here: it sends a reader to add a second lint step to a
workflow that already has one.

## Approach

`scriptNameFor(packageJson, job)` answers which script performs a job, preferring the conventional
name when something carries it — that name is still what CI and every other tool will look for —
and otherwise finding the script by what its command runs. `detectCi` then asks about that name
rather than a literal.

`tsc` needs `--noEmit` to count: a `build` script that compiles is not a typecheck gate, and
calling it one would report a gate that nothing enforces.

One definition of the shell-command vocabulary, in `src/detect/commandText.ts`. The token reader and
the command separator each already existed, in different files; they are moved there rather than
copied a third time, and `workspaces` joins the wrapper tokens because `yarn workspaces run eslint`
runs eslint — a monorepo root delegates, and reading the delegation as the command saw nothing.

## Verification

- the pre-existing suite over the moved helpers is what shows the relocation changed no behaviour
  (secret scanner, CI coverage, runner detection), with the tests added here excluded from that
- new tests for both directions: the conventional name winning over an alias, the namespaced form,
  a gate under an unexpected name, one behind a delegation, one in the second half of a command
  chain, an emitting `tsc` that is not a typecheck, and nothing at all
- `detectCi` asked with and without the real script name, which is the regression itself
- `diagnose --cwd` against graphai: the CI line gains the lint step, the false gap is gone, and
  `typecheck` — which that repo genuinely lacks — is still reported
