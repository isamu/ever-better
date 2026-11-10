# Untracked files are not source once there is a commit

Closes #105 — the untracked half. The generated half was #108.

## The defect

The census lists files with `git ls-files -co --exclude-standard`, which adds every untracked file
git would keep. On receptron/graphai (`fe450a1e`) two scratch files that exist in one working copy
topped the split backlog. A count that becomes a ceiling has to mean the same thing on CI and on
another clone, and CI sees only what is committed.

## Approach

A file that is untracked in a repository with at least one commit is left out of the census and
reported on its own line, `untracked N (not counted)`, so a total that shrank is explained and a
file someone is about to commit is still visible.

A repository with **no** commits counts its untracked files: a fresh `git init` is a legitimate
input — this repository's own end-to-end fixture is one — and there everything is untracked.
`git rev-parse --verify HEAD` decides which case it is.

`src/detect/untracked.ts` is the rule, a pure function over the two listings and that answer.

## Decisions

- **The rule covers the census and `listSourcePaths`** — the line counts, file sizes and language
  mix, and the source list `migrate` reads — so there is still one definition of source.
- **Presence detection keeps seeing untracked files.** Config files, workflows and workspaces are
  read from the full listing as before: right after `bootstrap` writes them they are not committed
  yet, and reporting them missing would be wrong.
- **Not a git repository** behaves as before: every file the walk finds is counted.
- **Generated wins over untracked.** An untracked file under a tsconfig `outDir` is counted as
  generated, the same as a tracked one, so it is not reported twice.

## Verification

- the rule, in both directions: commits with untracked files, no commits, nothing untracked, no git
- the diagnosis carries the count and the report prints the line only when it is non-zero
- end to end: the lifecycle fixture (no commits) still diagnoses its source, and the same tree
  after a commit plus one new untracked file reports that file as untracked and not counted
