# Workspace-aware presence detection

Fixes #103.

## The defect

`diagnose` reads the root `package.json` and the root directory and nothing else, so a Yarn
workspaces monorepo — where the configuration lives one directory down — reports as having no
ESLint, no TypeScript and no test runner. `bootstrap` then acts on that: a second test runner, a
root ESLint config over per-workspace ones, and a JavaScript→TypeScript migration of a repository
that is already TypeScript.

Measured on receptron/graphai at `fe450a1e`; the issue carries the table and the commands.

## Scope

Presence only — the three findings that make `bootstrap` destructive. Deliberately out:

- per-package baselines and per-package ledger (#30, which has a design question to settle first)
- the lint script recognised by name alone (#104)
- the file census counting untracked files and build output (#105, which the language *verdict*
  also depends on: with the census as it stands the repo reads as partly JavaScript, and the
  JavaScript it sees is compiler output)

So this change moves the verdict from "no TypeScript at all" to "mixed". #105 is what moves it to
the truth. Each is correct on its own and neither needs the other to land first.

## Approach

One new pure module, `src/detect/workspaces.ts`:

| Function | Answers |
| --- | --- |
| `workspacePatterns` | what the `workspaces` field lists, in either shape |
| `workspaceDirs` | which directories those patterns actually select, from the manifests in hand |
| `workspaceEntries` | the bare file names present in any workspace |

Discovery runs off the file list `gatherFacts` already has, so no extra filesystem walk. A pattern
that matches no `package.json` selects nothing, which is what makes a stale `workspaces` entry
harmless.

Presence then becomes a disjunction over root and workspaces — any workspace with a `tsconfig.json`
means the repository has TypeScript. Applied to ESLint, Prettier, knip, jscpd and the `tsconfig`
that decides the language mode.

**Not** applied to:

- the package manager — a lockfile is a root artifact, and a workspace holding one is a mistake
  rather than a fact to absorb
- the agent instruction files — a `CLAUDE.md` in one workspace is not the repository's, and
  counting it would make `prepare` skip writing the root one

The test runner needs each workspace's manifest rather than a file name, so `gatherFacts` reads
them and `detectTestRunnerAcross` falls back from the root to the first workspace that names one.

## Verification

- unit tests for each new function, both directions: no `workspaces` field, both field shapes, a
  pattern matching nothing, a negated pattern, `*` against `**`
- the existing suite unchanged, which is what shows a single-package repo reads as it did
- `diagnose --cwd` against a workspaces monorepo: the three false findings gone
