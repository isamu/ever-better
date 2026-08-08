---
description: Move a JavaScript repository to TypeScript one file at a time, dependencies first, fixing the type errors each rename introduces. Use when `diagnose` reports "No TypeScript", or the user says "TypeScript にしたい", "型を入れたい", "migrate this to TypeScript", "ts化して". Not for adding types to a repo that is already TypeScript — that is the drain skill's type tier.
---

# ever-better migrate

TypeScript is the cheapest rule set there is, and the tier that finds the most real bugs cannot run
without it. This is how a JavaScript repository gets there without a week of red builds.

## Why one file at a time

**Type errors have no suppression mechanism.** `--suppress-all` grandfathers lint violations; there
is no equivalent for the compiler. Rename everything at once and you have a repository whose
`typecheck` fails with thousands of errors and nothing able to stage the work — the state that gets
a migration reverted.

So: `allowJs` with `checkJs: false` first, which compiles the repo exactly as it is today. Then one
rename per commit, each with its errors fixed.

## Why dependencies first

`ever-better migrate` prints the order, and it is not alphabetical. Typing a file whose imports are
still JavaScript means typing it against `any` — and every one of those has to be revisited once the
dependency is typed. Leaf-first is the difference between doing the work once and doing it twice.

## Steps

### 1. See the plan

```bash
npx ever-better migrate
```

Writes `tsconfig.json` if there is none — `allowJs: true`, `checkJs: false`, so nothing is checked
yet and nothing breaks — then lists the files in dependency order.

**Read the cycles section.** Files in an import cycle cannot be ordered: none can go first, so they
migrate as one commit. A cycle is also worth reporting to the owner on its own — it is usually a
design problem that predates the migration.

### 2. Install the toolchain, if it is not there

```bash
npx ever-better bootstrap
```

The ESLint config it writes for a JavaScript repo deliberately omits the type-aware tier. Regenerate
it at the end, when there is something for it to check.

### 3. One file, one commit

```bash
npx ever-better migrate --file src/util/text.js
```

It renames the file and reports **how many new type errors that cost**. Fix them in the same commit
— they cannot be suppressed, so a commit that leaves them makes every later commit look broken.

What the errors usually are, in order of frequency:

| Error | What it is telling you |
| --- | --- |
| implicit `any` on a parameter | nobody ever wrote down what this takes |
| possibly `undefined` | a case the code has always handled by luck |
| property does not exist | the shape drifted from what callers pass |
| cannot find module | a `.js` specifier that needs its real extension |

**The second row is a bug, not a typing chore.** When the compiler says a value may be undefined and
the code dereferences it, that is a crash nobody had reproduced. Fix it, and write the test — say so
in the commit message rather than folding it into "migrate file X".

### 4. Never reach for a cast

`as`, `!`, `@ts-ignore` and `@ts-nocheck` are all banned by the generated config, and the ban is the
point of the migration. A cast records that the compiler could not check something and then hides
that fact from every reader. Write a type guard:

```ts
const isUser = (value: unknown): value is User =>
  typeof value === "object" && value !== null && "id" in value;
```

It is testable, it narrows for every caller, and it fails at the boundary where the data was
actually wrong rather than three frames later.

### 5. When the last file is done

```bash
npx ever-better bootstrap   # regenerate the config, now with the type-aware tier
npx ever-better freeze --force
```

`--force` is correct here and only here: the rule set genuinely changed, so the ceiling has to be
re-taken. Say so in the pull request.

Then set `checkJs` aside and delete `allowJs` from the tsconfig — with no `.js` left, both are
dead configuration that will confuse the next reader.

## What becomes an issue

- **A file whose types are a redesign.** If typing it honestly means changing what it does, that is
  a decision for the owner, not a migration commit.
- **A cycle that should be broken rather than migrated as a unit.**
- **A dependency with no types at all.** Whether to write a `.d.ts`, switch package, or accept a
  boundary of `unknown` is not yours to pick.
