---
description: Turn duplication that jscpd found into shared functions, and dead code that knip found into deletions. Judges which clones are knowledge worth extracting and which are coincidence to leave alone. Use when the user says "重複を消して", "DRY にして", "コピペを共通化", "dead code を消して", or after a duplication scan reports clones. Runs after the lint backlog is drained.
---

# ever-better dry

Lint sees inside a file. This is for what it cannot see: the same logic written twice in different
files, and code nobody calls at all.

**This is the sweep, not the first pass.** The drain already deletes a copy at the cheapest possible
moment — while the second one is being written (`ever-better-drain`, step 6d). What should reach
this phase is the duplication no single rule fix could see: clones across modules, and the shared
layer they imply. If a drain has run and jscpd still reports a great deal, that is worth saying out
loud rather than quietly extracting — it usually means the copies predate any of this work.

## Why the numbers do not gate

Both scans in a bootstrapped repo are **report-only**, and that is a rule rather than a stage:

- A **global duplication percentage cannot catch new duplication.** Twenty copied lines added to a
  hundred thousand move it by a hundredth of a point, so any threshold you passed before the copy
  you still pass after it.
- **knip has no base-branch diffing.** It reports the whole inventory, so it cannot say what *this*
  pull request orphaned.

A check that fails on something the author did not write is what teaches a team to reach for ignore
comments. So the scans inform this skill, and the ratchet stays with ESLint, which can point
precisely at new code.

The per-PR view comes from **SARIF into GitHub Code Scanning**, which does diff against the base —
that is what the generated `duplication-scan` workflow uploads.

## Duplication

### 1. Look at it, without a threshold

```bash
npx --yes jscpd@4 . --format "typescript,javascript" \
  --ignore "**/node_modules/**,**/dist/**,**/*.d.ts" \
  --reporters console,html --output report --blame
```

`--blame` attributes each clone, `html` gives a browsable report. **No `--threshold`** — you are
reading, not gating.

Read the breakdown **per language**. An overall 3% can hide 22% in one format, and averaging them
tells you nothing about either.

### 2. Decide: knowledge, or coincidence

This is the judgment the tool cannot make. One question settles most of it:

> **If the requirement changed, would I have to edit both copies?**

- **Yes → knowledge duplication.** Extract. Forgetting one copy is the bug this prevents.
- **No → coincidence.** Two validators both looping over fields and calling `push` are the same
  *shape*, not the same *knowledge*. Extracting them couples things that have no reason to change
  together, and the abstraction that results is harder to read than the repetition was.

Structurally-similar adapters — one per external service, one per platform — are usually the second
kind. Forcing them into a shared abstraction raises complexity while the duplication metric falls,
which is the metric winning over the code.

### 3. Extract, one clone at a time

Take the parameters that actually vary. If the extracted function needs a flag argument to pick
between two behaviours, you extracted the wrong thing — that flag is the difference the two callers
exist to express.

Give the extracted function a name that says what it decides, not where it came from. `formatCell`,
not `sharedHelper2`.

**The extraction gets a test**, and it is cheap to write because you just made it pure. That is
usually the real payoff: the duplicated code was untested in both places.

### 4. Verify and commit

```bash
<pm> lint && <pm> typecheck && <pm> test
npx ever-better check
```

One extraction per commit, naming both call sites. A reviewer needs to see that the two really were
the same.

## Where the shared code lives

An extraction with nowhere to go ends up beside one of its two callers, which is how the third
caller misses it. A repository that is going to stay DRY needs a standard module, and it has rules:

- **Named after what it knows, never after what it is.** `text`, `time`, `money`, `paths`. A file
  called `utils.ts`, `helpers.ts` or `common.ts` is a drawer: nobody can predict what is in it, so
  nobody looks, so the function gets written again — and the drawer is the one file every module
  imports, which makes it the hardest thing in the repo to change.
- **It imports nothing above it.** Pure functions over plain values, no reach back into feature
  code. That is what lets every layer use it without an import cycle, and it is why these are the
  easiest functions in the repo to test.
- **Everything in it is tested.** A bug here is a bug at every call site at once, which also makes
  it the best return on a test in the whole codebase.
- **Only what is used outside is exported.** knip reports the rest; an export with no external
  caller is surface you are maintaining for nobody.

Reach for the platform before writing one at all. `node:util`, `node:path`, `Intl`, `structuredClone`
and `Array.prototype.at` have all quietly replaced a package someone still depends on — and a
built-in cannot go unmaintained.

## Preventing the next copy

Removing duplication is the second-best outcome. The best is the helper being found before the
second one is written:

```bash
npx ever-better catalog
```

It writes `docs/shared-helpers.md` — every exported function, grouped by directory, with the first
sentence of its doc comment. **Point the repository's CLAUDE.md at it**, or it will not be read
before the next helper is written, and generating it will have achieved nothing.

This is the gap between the two scans. A linter sees inside one file. Duplication detection only
notices copies once they are textually similar — and two independent implementations of the same
idea rarely are. Nothing else reports the same function under a sixth name.

Regenerate it after a refactor rather than editing it; it is derived, and a stale catalogue is
worse than none because it sends the reader looking for something that moved.

## Dead code

```bash
<pm> knip
```

Three kinds, and they are not equally trustworthy:

- **Unused files** — usually real, and usually the orphan a refactor left behind. Delete them.
  Nothing else in CI can see one: typecheck, tests and the build all stay green around a file
  nobody imports.
- **Unused exports** — often real, sometimes an entry point knip could not infer. Before deleting,
  check it is not reached by a CLI subcommand, codegen, or a dynamic import. If it is, add it to
  `entry` in `knip.json` rather than deleting it.
- **Unused dependencies** — check whether the package is used by a config file or a script before
  removing.

An export used only inside its own module is not dead — **stop exporting it**. That is the fix, not
deletion, and it shrinks the public surface at the same time.

Keep the inventory at zero once you get there. An empty inventory is what makes the next report
readable: with nothing in it, "everything knip lists" and "what this PR orphaned" are the same list.

## What becomes an issue

Open one rather than guessing when:

- **A clone spans a module boundary the extraction would have to cross.** Where the shared function
  should live is an architecture decision.
- **The duplication is between a package and its consumer**, so extracting means publishing.
- **An unused export is public API.** It may be dead here and load-bearing for someone else.

Say which clones, what you would extract, where you would put it, and what it would cost. Then move
on to the next one instead of waiting.

```bash
npx ever-better log --kind deferred "3 clones between server/ and web/; extracting crosses the package boundary — #47"
```

**A clone you decided to leave needs the entry more than one you extracted.** The extraction is in
the diff; the judgement that two similar blocks are coincidence rather than one idea is visible
nowhere else, and the next run will otherwise re-open the same question and reach a different
answer.
