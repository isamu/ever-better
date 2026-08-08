---
description: Install the quality tooling a repository is missing and review the generated config before anything is enforced. Use after `ever-better diagnose` reports gaps in the bootstrap phase, or when the user says "lint を入れて", "eslint 設定して", "set up linting and tests here", "TypeScript にしたい". Ends at the point where the baseline can be frozen — it never freezes.
---

# ever-better bootstrap

Close the `bootstrap` gaps: ESLint (flat config), a formatter, a test runner, the package scripts
CI needs, and a CI workflow. Nothing is enforced at the end of this skill — that is `freeze`.

## Before you start

Run `npx ever-better diagnose` and read it. If the working tree is dirty, stop and say so: this
skill generates files and installs packages, and separating that from the user's own work after
the fact is not worth the argument.

## Steps

### 1. Show the plan, do not apply it yet

```bash
npx ever-better bootstrap --dry-run
```

Read the list back to the user with what each item means for them. Two decisions actually need a
human, and both are easy to miss:

- **The file line limit.** The generated config uses 600. `diagnose` reported how many files
  already exceed it. If that number is large, the backlog is real refactoring work — worth
  agreeing on now rather than discovering at freeze time.
- **JavaScript repos get the untyped tier.** The type-aware rules are where most real bugs are
  found, and they cannot run without TypeScript. If the repo is `.js`, say plainly that migrating
  unlocks the valuable half, and ask whether to do that first. Do not migrate silently.

The framework is detected, not asked about, so check the `framework` line in `diagnose` matches
what the repo actually is before applying. Vue and Nuxt get `eslint-plugin-vue` and a `vue-tsc`
typecheck script; React gets `eslint-plugin-react-hooks`; Next adds the Next plugin on top. If it
reports **svelte** or **astro**, those file types are not configured yet — say so, because
freezing then records a baseline that ignores them.

### 2. Apply

```bash
npx ever-better bootstrap
```

Idempotent, and it never overwrites a config the repo already had — someone's existing
`eslint.config.js` holds exceptions whose reasons are not in the file.

### 3. Raise the toolchain before you measure anything

`bootstrap` installs what is *missing* at current versions; it does not touch what is already there.
So a repo on ESLint 8, TypeScript 4 and an old Prettier is still about to be measured by them:

```bash
<pm> outdated
```

Take the linter, the formatter, the type checker, the test runner and the build tool to current —
majors included — in their own commit, before the format run and before anything is frozen. The
`devDependencies` and `resolutions` blocks are the whole scope here.

The reason it is *this* early: the ceiling records violations of the rule set you own at freeze
time. Freeze on the old ESLint and the upgrade afterwards pins suppressions for rules that no longer
exist, hides the ones that arrived, and re-runs the whole drain. A newer TypeScript also infers more,
so part of today's `no-unsafe-*` backlog evaporates rather than being fixed by hand. And Prettier's
output changes between majors — upgrading after the format commit means formatting the repo twice.

This is also the safe half of the upgrade work: dev tooling cannot change what ships, only what it
says about what ships. **Runtime dependencies are a different decision and come later** — see
"Dependencies" in the `ever-better` entry skill.

### 4. Format first, in its own commit

```bash
<pm> format
```

Formatting rewrites nearly every file. If it lands in the same commit as anything else, that
commit is unreviewable. Commit it alone, with a message that says it is mechanical.

### 5. Look at what was generated

Open `eslint.config.js` and read it with the user. It is theirs now. Two things to check:

- **Does any tier obviously not fit?** A repo of build scripts does not want
  `max-lines-per-function` at 60. Adjust before freezing — after freezing, a change to the rules
  changes what the ceiling means.
- **Do the ignores cover the generated code?** Anything checked in but machine-written should be
  ignored, not suppressed. Suppressing it puts noise in the ledger forever.
- **The CI workflow runs Linux, macOS and Windows — keep all three.** Path separators, a CRLF
  checkout against LF-formatted files, and the extensionless `node_modules/.bin` shims that Node
  cannot spawn are each green on Linux and red only on Windows. Trimming the matrix to save minutes
  does not remove those failures, it removes the only thing that reports them — and they then arrive
  in someone's install rather than in a pull request.

### 6. Confirm it runs

```bash
<pm> lint
```

Expect a large number of errors. That is the point — you are looking at the backlog for the first
time. What you are checking for here is that ESLint *runs*: no parse errors, no "was not found by
the project service", no plugin resolution failure. A parse error cannot be suppressed and will
block the freeze.

### 7. Hand off

```bash
npx ever-better log --kind note "eslint 8 -> 10, sonarjs + security tiers on; max-lines-per-function left at 60 for a scripts repo"
```

Record what you turned on and, more importantly, **what you turned off and why** — the ceiling
frozen next is a number from exactly this rule set, and a tier missing for a reason is
indistinguishable later from a tier nobody got to.

Say how many violations there are and across how many rules, then route to the
**`ever-better-freeze`** skill. Do not freeze here — freezing is a decision, and the user should
make it having seen the number.

## If the repo is on legacy `.eslintrc`

Migrate to flat config first; every tier here assumes it. `npx @eslint/migrate-config .eslintrc.js`
gets most of the way. Treat the migration as its own PR — mixing it with new rules makes it
impossible to tell which change caused which error.
