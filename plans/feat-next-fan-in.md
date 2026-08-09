# `ever-better next --fan-in`

Issue: #41. Follows #40.

## What it answers

"How far does a fix in this file reach?" — the part of *difficulty* that violation counts cannot
see. A `no-explicit-any` in a module twenty files import changes an exported shape, and the errors
appear in files the diff never opened. The same finding in a leaf is one edit.

## Why a flag and not the default

`next` reads one small JSON. Fan-in has to read **every source file** to parse its imports, which is
`ever-better migrate`'s weight. A command run between edits should not pay that unasked.

## Why it does not reorder

Fan-in makes a **type** fix expensive. It says nothing about `max-depth` or `no-case-declarations`,
where the fix is local no matter who imports the module. Sorting the backlog on it would be wrong
for half the rules, and wrong silently.

So the number is printed and nothing moves. Which rules it applies to is judgment, and judgment is
the skill's half of this tool.

## Not `gatherFacts`

`gatherFacts` also runs `eslint --print-config` and `tsc --showConfig`. Two subprocesses the import
graph has no use for, on a flag whose whole point is that the cost is chosen deliberately.

But writing a second definition of "what is a source file" is worse. So the listing `gatherFacts`
already computes gets exported and both callers share it — one definition, two entry points, and
only one of them pays for probes.

## Files

| File | What |
| --- | --- |
| `src/facts.ts` | export `listSourcePaths`; `gatherFacts` uses it, so the rule stays in one place |
| `src/util/sources.ts` | new — read a file list into the `Map<path, text>` `buildGraph` wants |
| `src/commands/migrate.ts` | use it, instead of the inline copy it has now |
| `src/fanIn.ts` | new, pure — reverse the graph, count importers |
| `src/drainOrder.ts` | `buildDrainPlan(entries, importers?)`; the plan carries the counts for files in the backlog |
| `src/render/next.ts` | `(imported by N)` on the rows that already exist |
| `src/commands/next.ts`, `src/cli.ts` | the `--fan-in` flag |
| `test/test_fanIn.ts` | new — counting, cycles, files nobody imports |
| `README.md`, `README.ja.md`, `skills/ever-better-drain/SKILL.md` | document it |

## What "imported by N" claims

**Direct importers, not transitive reach.** A transitive count is the truer measure of a type
change's blast radius and costs a closure over the graph; direct importers is one pass and is not
misleading as long as the wording says which it is. The output says "imported by", not "reaches".

Only relative specifiers resolve (`importGraph` is deliberate about this — a package import is
already typed or already is not), so a file imported only through a path alias counts low. Worth
knowing before trusting a zero.

## Verification

- pure functions over fixture graphs: a leaf, a hub, a cycle, a file nobody imports
- against this repository: `next --fan-in` on a real backlog, and `--json` carrying the map
- the flag is genuinely optional — `next` without it must not read a single source file
- `yarn format` / `lint` / `typecheck` / `build` / `test` / `knip`, exit codes checked
