# Compiler output is not source

Part of #105 — the generated half. The untracked half stays open; see below.

## The defect

The file census counts every file git would keep, which in a repository that commits its build
output means the emitted copy of every file is counted beside the file. On receptron/graphai
(`fe450a1e`) that put compiled JavaScript into the split backlog and reported a repository that is
almost entirely TypeScript as substantially JavaScript — which then recommends migrating files the
compiler wrote.

## Approach

A directory a tsconfig names as `outDir` is not source. Read from the text rather than
`JSON.parse`, because a tsconfig is very often JSONC — the same reason `tsconfigEdit` works on
text — and with comments stripped first, so a commented-out `outDir` names no directory.

Every tsconfig in the repository is asked, not only the root one: in a monorepo each package
declares its own. Two directions are dropped rather than honoured, both because excluding real
source is the expensive mistake:

- an `outDir` resolving to the repository root, which would mark every file generated
- one escaping the repository, which this tool cannot see into anyway

The count of excluded files is rendered, so a total that shrank is explained rather than odd.

## What is deliberately left

The other half of #105 — untracked files counted as source — is **not** here. It looked like a
one-word change (`-co` to `-c`) until this repository's own end-to-end fixture turned out to be a
`git init` with no commit in it: every file there is untracked, so counting tracked files alone
would report a fresh project as having no source at all. That needs a rule about repositories
without commits, which is a decision rather than a patch.

## Verification

- unit tests for each function, both directions: the option present and absent, beside the trailing
  block comment tsc's own template writes, commented out in both comment styles, resolved against a
  package directory, a relative step out of one, the repository root, an escape, and a sibling
  directory whose name merely starts the same
- `diagnose --cwd` against graphai before and after: the TypeScript share and the file count
