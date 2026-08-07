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

### 3. Format first, in its own commit

```bash
<pm> format
```

Formatting rewrites nearly every file. If it lands in the same commit as anything else, that
commit is unreviewable. Commit it alone, with a message that says it is mechanical.

### 4. Look at what was generated

Open `eslint.config.js` and read it with the user. It is theirs now. Two things to check:

- **Does any tier obviously not fit?** A repo of build scripts does not want
  `max-lines-per-function` at 60. Adjust before freezing — after freezing, a change to the rules
  changes what the ceiling means.
- **Do the ignores cover the generated code?** Anything checked in but machine-written should be
  ignored, not suppressed. Suppressing it puts noise in the ledger forever.

### 5. Confirm it runs

```bash
<pm> lint
```

Expect a large number of errors. That is the point — you are looking at the backlog for the first
time. What you are checking for here is that ESLint *runs*: no parse errors, no "was not found by
the project service", no plugin resolution failure. A parse error cannot be suppressed and will
block the freeze.

### 6. Hand off

Say how many violations there are and across how many rules, then route to the
**`ever-better-freeze`** skill. Do not freeze here — freezing is a decision, and the user should
make it having seen the number.

## If the repo is on legacy `.eslintrc`

Migrate to flat config first; every tier here assumes it. `npx @eslint/migrate-config .eslintrc.js`
gets most of the way. Treat the migration as its own PR — mixing it with new rules makes it
impossible to tell which change caused which error.
