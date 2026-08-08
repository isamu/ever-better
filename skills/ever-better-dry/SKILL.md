---
description: Turn duplication that jscpd found into shared functions, and dead code that knip found into deletions. Judges which clones are knowledge worth extracting and which are coincidence to leave alone. Use when the user says "重複を消して", "DRY にして", "コピペを共通化", "dead code を消して", or after a duplication scan reports clones. Runs after the lint backlog is drained.
---

# ever-better dry

Lint sees inside a file. This is for what it cannot see: the same logic written twice in different
files, and code nobody calls at all.

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
