---
description: Move a JavaScript repository to TypeScript in one pass — rename everything, get it compiling, and let the lint fallout land in the ratchet instead of blocking the migration. Use when `diagnose` reports "No TypeScript", or the user says "TypeScript にしたい", "型を入れたい", "migrate this to TypeScript", "ts化して". Not for adding types to a repo that is already TypeScript — that is the drain skill's type tier.
---

# ever-better migrate

TypeScript is the cheapest rule set there is, and the tier that finds the most real bugs cannot run
without it. Convert the repository, then let the tools tell you what is actually wrong.

## Convert all of it, in one pass

```bash
npx ever-better migrate --all
```

A half-migrated repository has the costs of both states and the benefit of neither: the type-aware
rules still cannot run, the linter still cannot see across the untyped half, and every file typed
against a JavaScript import gets revisited when that import lands. Renaming everything ends that on
day one — and the errors it surfaces are the point of the exercise, not an accident to be avoided.

**Do not stop for lint errors.** There will be a great many. That is what the ratchet is for: freeze
records them as the ceiling, and they come down rule by rule afterwards with real fixes. Stopping
the migration to satisfy a linter that has not even been configured yet is work done in the wrong
order.

## The two kinds of error, and only one of them stops you

| | Can it be grandfathered? | What you do |
| --- | --- | --- |
| **Lint error** | Yes — `--suppress-all` records it | Nothing now. It becomes the baseline, then the drain. |
| **Type error** | No. The compiler has no equivalent | Fix what blocks the build, or start from a looser tsconfig |

That asymmetry is the whole shape of this skill. A repository whose `typecheck` fails cannot build,
so the compiler gets attention now; the linter gets it after `freeze`.

## Steps

### 1. See what it will cost

```bash
npx ever-better migrate
```

Writes `tsconfig.json` if there is none — `allowJs: true`, `checkJs: false`, so nothing is checked
yet and nothing breaks — then lists the files it would rename.

### 2. Install the toolchain, if it is not there

```bash
npx ever-better bootstrap
```

The ESLint config it writes for a JavaScript repo deliberately omits the type-aware tier. Regenerate
it at the end, when there is something for it to check.

### 3. Rename everything, in its own commit

```bash
npx ever-better migrate --all
```

It reports how many type errors the rename cost. Commit the rename by itself — a mechanical commit
that touches every filename is unreviewable if it also contains fixes.

**Rename and type; do not restructure.** Splitting the function, renaming the variables and
extracting the helper all belong after the repo is typed — the compiler and the type-aware rules are
about to tell you which parts are actually wrong, and a shape chosen before hearing that is a shape
you will choose twice.

### 4. Get it compiling again

Take the type errors in the order the compiler reports them. What they usually are:

| Error | What it is telling you |
| --- | --- |
| implicit `any` on a parameter | nobody ever wrote down what this takes |
| possibly `undefined` | a case the code has always handled by luck |
| property does not exist | the shape drifted from what callers pass |
| cannot find module | a `.js` specifier that needs its real extension |

**The second row is a bug, not a typing chore.** When the compiler says a value may be undefined and
the code dereferences it, that is a crash nobody had reproduced. Fix it, write the test, and say so
in the commit message rather than folding it into "migrate".

If the count is large enough to be its own project, **loosen the tsconfig rather than stalling** —
`strict: false` compiles, and:

```bash
npx ever-better strictness
```

prices each flag separately, so they can be switched on one at a time later with the cost known in
advance. A repo that compiles loosely today and tightens on a schedule beats one that has been
mid-migration for a month.

### 5. Never reach for a cast

`as`, `!`, `@ts-ignore` and `@ts-nocheck` are all banned by the generated config, and the ban is the
point of the migration. A cast records that the compiler could not check something and then hides
that fact from every reader. Write a type guard:

```ts
const isUser = (value: unknown): value is User =>
  typeof value === "object" && value !== null && "id" in value;
```

It is testable, it narrows for every caller, and it fails at the boundary where the data was
actually wrong rather than three frames later.

### 6. Regenerate the config, sweep what the fixer can do, then take the baseline

```bash
npx ever-better bootstrap   # regenerate the config, now with the type-aware tier
npx eslint . --fix          # var -> let -> const, guard clauses, formatting
npx ever-better freeze --force
```

**`--fix` before `freeze`, never after.** Whatever it repairs now never enters the ratchet, and on a
repository arriving from JavaScript `no-var`, `prefer-const`, `no-else-return` and Prettier are
usually the largest single block of the backlog. Read the diff — it should contain no behaviour
change at all — and commit it on its own.

**What the fixer refuses to convert is a finding, not a leftover.** ESLint leaves a `var` alone
when its function scope is load-bearing: captured by a closure inside a loop, or read outside the
block it was declared in. Both stay reported. Those are the hoisting bugs `var` is known for, and
each one is a decision — hand it the block scope it should have had and check what changes.

`--force` is correct here and only here: the rule set genuinely changed, so the ceiling has to be
re-taken. Say so in the pull request — and in the ledger, which is where the next session looks:

```bash
npx ever-better log --kind note "migrated 214 files; 37 type errors fixed; strict:false for now, flags priced in #51; freeze --force because the rule set changed"
```

A `--force` nobody explained looks exactly like a `--force` used to make a red build green.

Then delete `allowJs` and `checkJs` from the tsconfig — with no `.js` left, both are dead
configuration that will confuse the next reader.

### 7. Now read the linter, and let it pick the work

```bash
<pm> lint
```

This is the first honest backlog this repository has ever had: until now the type-aware tier could
not run, so the rules that find the real bugs were reporting nothing.

**A rule that fires on a pattern this repo uses everywhere is a configuration question, not a
refactor.** Decide it in `eslint.config.js` before draining — that is the cheap moment, because the
alternative is hand-fixing hundreds of violations of a rule the repo was never going to keep. A rule
you do keep, you keep for real: the suppressions file grants the exception once, and softening the
rule later grants it forever and silently.

Then go to **`ever-better-drain`** and work it rule by rule.

## When one file at a time is the better call

`--file` still exists, and it migrates in dependency order:

```bash
npx ever-better migrate --file src/util/text.js
```

Reach for it when the repository must stay releasable through the migration, or when `--all`
produced a type-error count nobody is going to work through in one sitting. Dependencies go first
because typing a file whose imports are still JavaScript types it against `any`, and that work is
redone once the dependency lands.

**Read the cycles section of the plan.** Files in an import cycle cannot be ordered: none can go
first, so they migrate together. A cycle is worth reporting to the owner on its own — it is usually
a design problem that predates the migration.

## What becomes an issue

- **A file whose types are a redesign.** If typing it honestly means changing what it does, that is
  a decision for the owner, not a migration commit.
- **A dependency with no types at all.** Whether to write a `.d.ts`, switch package, or accept a
  boundary of `unknown` is not yours to pick.
- **A cycle that should be broken rather than migrated as a unit.**
