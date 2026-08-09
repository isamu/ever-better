# Rank the backlog by leverage — `ever-better next`

Issue: #39

## The problem in one line

The suppressions file knows which file carries which rule; the tool throws that away and keeps a
per-rule integer, so it cannot say what is cheap.

## What the data actually is

```json
{ "src/util/text.ts": { "@typescript-eslint/no-explicit-any": { "count": 2 } } }
```

Per file, per rule, a count. `readSuppressionTotal` sums it and returns one number. `state.rules`
stores `{ baseline, current }` per rule. Nothing anywhere holds the pair.

The ratchet is per file, per rule: **a file with no entry for a rule errors on the next violation of
it.** So taking one file to zero is not a partial win — it permanently enforces that rule in that
file. That is the fact the ordering is built on.

## What `next` computes

All of it is arithmetic over the parsed map. No filesystem walk, no lint run.

| Section | Rule |
| --- | --- |
| **Take these first** | entries with `count <= 2`, cheapest first — each one enforces a rule in a file |
| **Rules by work, not by size** | per rule: total and how many files carry it; fewest files first |
| **One file from a clean directory** | group by `(dirname, rule)`; report groups of 1–2 files |
| **Leave for later** | files carrying the most rules × violations |

Headline is absolute and goes down: `214 violations · 87 files · 12 rules`. **No percentage** — the
denominator would be "every file ESLint lints", which is not in the suppressions file, and inventing
it from `git ls-files` would count files the linter never sees. A wrong percentage is worse than
none.

## What is deliberately not in it

- **Fan-in ("this type is read by 20 files, leave it")** — needs every source file read, which turns
  a status command into a repo walk. `src/migrate/importGraph.ts` already does it for the migration
  order; wire it in later if the cheap difficulty signal below is not enough.
- **Difficulty beyond structure.** A file's rule count and violation count are the whole signal.
  Whether a given `any` is hard is a judgment, and judgment is the skill's job.

## Files

| File | What |
| --- | --- |
| `src/suppressionsFile.ts` | add `readSuppressions` returning `{ file, rule, count }[]`; `readSuppressionTotal` folds it |
| `src/drainOrder.ts` | new, pure — the four rankings plus totals |
| `src/render/next.ts` | new, pure — the text |
| `src/commands/next.ts` | new, thin — read, rank, render, `--json` |
| `src/cli.ts` | register the command and the usage line |
| `test/test_drainOrder.ts` | new — the rankings, including the ties and the empty case |
| `skills/ever-better-drain/SKILL.md` | step 1 points at `next`; step 4 gains the `any` attack order |
| `README.md`, `README.ja.md` | document `next` |

## The skill half

The only part that is not arithmetic. `no-explicit-any` is attacked source-first, because types flow
downhill and one annotation at the origin deletes the `any` at every site downstream:

1. the origin — `JSON.parse`, `fetch().json()`, a library's return value
2. **the container before the elements** — type the array, and the element `any` goes with it
3. `catch (e: any)` — an access problem, not a type problem: `unknown` plus an `errorMessage` helper
4. `as any` last — it is an assertion, not a type, so removing it needs evidence
5. leave: a type many files read, a shape only the runtime knows, an exported signature

Nothing in the skill duplicates what `next` prints. The order of *rules* comes from the command; the
order of *edits inside one rule* is the skill.

## Verification

- pure functions: `node:test` over fixture maps — ties, an empty map, a file with one rule, a
  directory where every file still carries the rule
- the command end to end: run `next` against this repository's own `eslint-suppressions.json`
- `yarn format` / `lint` / `typecheck` / `build` / `test`, exit codes checked rather than piped
